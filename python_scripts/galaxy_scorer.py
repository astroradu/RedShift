"""Galaxy Visibility Scorer.

Scores PGC galaxies by visibility across a configurable rolling window of
upcoming calendar months for a given observer location. Higher scores indicate
better astrophotography imaging windows (zenith proximity during astronomical
night).

The catalogue (``assets/pgc_large_galaxies.csv``) holds thousands of rows so
this script is built around early streaming filtering: every row is read with
``csv.DictReader`` and discarded immediately if it fails the ``objtype == "G"``
test (unless ``--compute-nonstandard true``) or the declination pre-filter
``Dec >= -(90 - |lat|)``. Only the surviving rows feed the batched
``SkyCoord.transform_to(AltAz)`` call — the same core perf optimisation used by
``constellation_scorer.py``.

Stderr step markers match the constellation scorer's ``[N/5]`` cadence so the
sidecar's SSE progress parser can be reused without modification.

Run from the project root::

    python galaxy_scorer.py --lat 45.0 --lon 26.0 --export csv
    python galaxy_scorer.py --lat 45.0 --lon 26.0 \\
        --night-precision 5 --month-precision 5 --window 12 \\
        --compute-nonstandard true --export csv
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Venv self-bootstrap — mirror constellation_scorer.py.
# ---------------------------------------------------------------------------
def _reexec_in_venv_if_needed() -> None:
    venv_dir = Path(__file__).resolve().parent / ".venv"
    if Path(sys.prefix).resolve() == venv_dir.resolve():
        return
    try:
        import astropy  # noqa: F401
        import astroplan  # noqa: F401
        import numpy  # noqa: F401
        return
    except ImportError:
        pass
    venv_python = venv_dir / "bin" / "python"
    if not venv_python.is_file():
        return
    os.execv(str(venv_python), [str(venv_python), __file__, *sys.argv[1:]])


_reexec_in_venv_if_needed()

import argparse
import csv
import logging
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date

import astropy.units as u
import numpy as np
from astropy.coordinates import SkyCoord

# Reuse the well-tested helpers from the constellation scorer — they are
# coordinate-agnostic and already cover the observer / twilight / scoring math.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from constellation_scorer import (  # noqa: E402  — needs sys.path tweak above
    MAX_WINDOW_MONTHS,
    PivotInfo,
    ZENITH_ALT_DEG,
    _best_month_label,
    _full_month_label,
    _short_month_label,
    aggregate_monthly,
    build_observer,
    compute_all_altitudes,
    compute_scores,
    get_local_timezone,
    get_month_list,
    precompute_all_timestamps,
)

# ---------------------------------------------------------------------------
# Module-level constants
# ---------------------------------------------------------------------------

DEFAULT_DATA_PATH: Path = Path(__file__).parent / "assets" / "pgc_large_galaxies.csv"
DEFAULT_OUTPUT_DIR: Path = Path(__file__).parent / "output"
DEFAULT_CSV_PATH: Path = DEFAULT_OUTPUT_DIR / "galaxy_scores.csv"

DEFAULT_WINDOW_MONTHS: int = 3
DEFAULT_NIGHT_PRECISION: int = 3
DEFAULT_MONTH_PRECISION: int = 3

GALAXY_OBJTYPE: str = "G"

# CSV columns the scorer reads/uses directly. All other columns are passed
# through verbatim into the output's "metadata tail" so the frontend has the
# full PGC catalogue per row without re-fetching the source file.
_PGC_COL = "pgc"
_OBJTYPE_COL = "objtype"
_RA_COL = "ra_deg"
_DEC_COL = "dec_deg"
_MAJOR_ARCMIN_COL = "major_arcmin"
_MINOR_ARCMIN_COL = "minor_arcmin"

# Columns the scorer writes itself; "metadata tail" excludes these.
_PROMOTED_COLS: tuple[str, ...] = (_PGC_COL,)

logger = logging.getLogger("galaxy_scorer")


# ---------------------------------------------------------------------------
# Streaming CSV ingestion
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class GalaxyRecord:
    """A single galaxy after early filtering, with metadata for output passthrough.

    Parameters
    ----------
    pgc : str
        PGC identifier (verbatim from the ``pgc`` column — kept as a string so
        leading zeros and very large IDs survive the round-trip).
    ra_deg : float
        Right ascension in degrees (J2000).
    dec_deg : float
        Declination in degrees (J2000).
    metadata : tuple of str
        All non-promoted columns from the source row, in source order. Written
        verbatim into the output CSV's metadata tail so the UI can show the
        full catalogue entry.
    """

    pgc: str
    ra_deg: float
    dec_deg: float
    metadata: tuple[str, ...]


def _is_potentially_visible(dec_deg: float, observer_lat_deg: float) -> bool:
    """Same horizon test as the constellation scorer (mirrored bound)."""
    if observer_lat_deg >= 0:
        return dec_deg > -(ZENITH_ALT_DEG - abs(observer_lat_deg))
    return dec_deg < (ZENITH_ALT_DEG - abs(observer_lat_deg))


def stream_galaxy_records(
    csv_path: Path,
    observer_lat_deg: float,
    *,
    compute_nonstandard: bool,
    min_angular_size_arcmin: float = 0.0,
) -> tuple[list[GalaxyRecord], list[str], dict[str, int]]:
    """Stream the PGC CSV and yield only rows that survive all early filters.

    The catalogue is ``> 3000`` rows today and grows over time, so the file is
    read row-by-row via :class:`csv.DictReader`. Every row is filtered as it
    arrives — the entire dataset is never held in memory at once.

    Parameters
    ----------
    csv_path : Path
        Source CSV (UTF-8). Must include at least the ``pgc``, ``objtype``,
        ``ra_deg`` and ``dec_deg`` columns.
    observer_lat_deg : float
        Observer latitude — drives the declination pre-filter.
    compute_nonstandard : bool
        ``False`` (default) keeps only rows where ``objtype == "G"``.
        ``True`` keeps every objtype.
    min_angular_size_arcmin : float
        When ``> 0.0``, keep only rows where
        ``major_arcmin > value OR minor_arcmin > value``.
        Applied before the declination pre-filter — cheap column comparison
        that cuts the dataset early. ``0.0`` (default) disables the filter.

    Returns
    -------
    records : list of GalaxyRecord
        Galaxies that passed all early filters, in original CSV order.
    metadata_columns : list of str
        Header labels for the metadata tail (i.e. every column except ``pgc``),
        in original CSV order. Used to stamp the output header.
    counts : dict of str -> int
        ``{"total": N_total, "objtype_filter_kept": N_after_obj, "kept": N_kept}``
        — primarily for logging / verbose output.
    """
    if not csv_path.is_file():
        raise FileNotFoundError(f"Galaxy data file not found: {csv_path}")

    records: list[GalaxyRecord] = []
    metadata_columns: list[str] = []
    total = 0
    kept_objtype = 0

    # newline='' lets csv handle CRLF correctly; encoding stays UTF-8 (no BOM
    # — the source file is plain UTF-8, not BOM-prefixed like our outputs).
    with csv_path.open("r", encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        if reader.fieldnames is None:
            raise ValueError(f"CSV has no header: {csv_path}")
        required = {_PGC_COL, _OBJTYPE_COL, _RA_COL, _DEC_COL}
        missing = required - set(reader.fieldnames)
        if missing:
            raise ValueError(f"CSV missing required columns: {sorted(missing)} in {csv_path}")

        # Metadata tail = every column except the promoted ones (currently
        # just `pgc`). objtype/ra/dec stay in the tail so the popup can show
        # them — only `pgc` is hoisted to a leading column.
        metadata_columns = [c for c in reader.fieldnames if c not in _PROMOTED_COLS]

        for row in reader:
            total += 1
            objtype = (row.get(_OBJTYPE_COL) or "").strip()
            if not compute_nonstandard and objtype != GALAXY_OBJTYPE:
                continue
            kept_objtype += 1

            if min_angular_size_arcmin > 0.0:
                try:
                    major = float(row.get(_MAJOR_ARCMIN_COL) or 0.0)
                    minor = float(row.get(_MINOR_ARCMIN_COL) or 0.0)
                except (TypeError, ValueError):
                    major = minor = 0.0
                if not (major > min_angular_size_arcmin or minor > min_angular_size_arcmin):
                    continue

            try:
                ra_deg = float(row[_RA_COL])
                dec_deg = float(row[_DEC_COL])
            except (TypeError, ValueError):
                # Malformed coordinate cell — skip silently (these are rare in
                # the PGC catalogue and would otherwise poison the AltAz batch).
                continue

            if not _is_potentially_visible(dec_deg, observer_lat_deg):
                continue

            metadata = tuple((row.get(col) or "") for col in metadata_columns)
            records.append(
                GalaxyRecord(
                    pgc=(row.get(_PGC_COL) or "").strip(),
                    ra_deg=ra_deg,
                    dec_deg=dec_deg,
                    metadata=metadata,
                )
            )

    counts = {
        "total": total,
        "objtype_filter_kept": kept_objtype,
        "kept": len(records),
    }
    logger.info(
        "Galaxy ingest: total=%d objtype_kept=%d kept=%d "
        "(compute_nonstandard=%s, min_angular_size_arcmin=%.1f)",
        total,
        kept_objtype,
        len(records),
        compute_nonstandard,
        min_angular_size_arcmin,
    )
    return records, metadata_columns, counts


def _records_to_skycoord(records: list[GalaxyRecord]) -> SkyCoord:
    """Pack surviving records into a single ``SkyCoord(N,)`` for batched AltAz."""
    return SkyCoord(
        ra=np.array([r.ra_deg for r in records]) * u.deg,
        dec=np.array([r.dec_deg for r in records]) * u.deg,
        frame="icrs",
    )


# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------


def _galaxy_csv_header(
    metadata_columns: Iterable[str], short_labels: list[str]
) -> list[str]:
    """Header row for the output CSV — promoted cols, scores, then metadata tail."""
    return [_PGC_COL, *short_labels, "Best Month", "Total", *metadata_columns]


def export_csv(
    records: list[GalaxyRecord],
    metadata_columns: list[str],
    score_matrix: np.ndarray,
    output_path: Path,
    pivot_infos: list[PivotInfo],
    month_list: list[tuple[int, int]],
    tz_label: str = "UTC",
) -> None:
    """Write the scored table + pivot log to ``output_path``.

    Layout matches ``constellation_scorer.export_csv`` so the sidecar's
    two-section parser can be reused without forking the format:

    1. **Scores section** — header ``pgc, <month_labels…>, Best Month, Total,
       <original CSV columns…>``, sorted by ``Total`` descending.
    2. **Pivot timestamps section** — separated by a blank row, identical to
       the constellation scorer's pivot section.
    """
    if score_matrix.shape[0] != len(records):
        raise ValueError(
            f"score matrix rows {score_matrix.shape[0]} != record count {len(records)}"
        )

    annual_totals = score_matrix.sum(axis=1)
    sort_order = np.argsort(-annual_totals, kind="stable")

    span_years = len({y for y, _ in month_list}) > 1
    short_labels = [_short_month_label(y, m, span_years) for y, m in month_list]
    full_labels = [_full_month_label(y, m, span_years) for y, m in month_list]

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8-sig", newline="") as fh:
        fh.write("sep=,\r\n")
        writer = csv.writer(fh)

        # --- Section 1: scores ---
        writer.writerow(_galaxy_csv_header(metadata_columns, short_labels))
        for idx in sort_order:
            record = records[idx]
            row_scores = score_matrix[idx]
            row_cells: list[object] = [
                record.pgc,
                *[round(float(score), 2) for score in row_scores],
                _best_month_label(row_scores, full_labels),
                round(float(row_scores.sum()), 2),
                *record.metadata,
            ]
            writer.writerow(row_cells)

        # --- Section 2: pivot timestamps (matches constellation_scorer.py) ---
        writer.writerow([])
        writer.writerow(["# Pivot Timestamps"])
        writer.writerow([f"Timestamp ({tz_label})", "Note"])
        for info in pivot_infos:
            if info.is_valid:
                writer.writerow([info.dt_str, info.label])

    logger.info("Wrote galaxy CSV report to %s", output_path)


def format_table(
    records: list[GalaxyRecord],
    score_matrix: np.ndarray,
    month_list: list[tuple[int, int]],
    *,
    max_rows: int = 25,
) -> str:
    """Render a compact human-readable table — used when running on the CLI.

    The full file is streamed to CSV; this preview is bounded so that running
    the script on the full PGC catalogue does not flood the terminal.
    """
    annual_totals = score_matrix.sum(axis=1)
    sort_order = np.argsort(-annual_totals, kind="stable")

    span_years = len({y for y, _ in month_list}) > 1
    short_labels = [_short_month_label(y, m, span_years) for y, m in month_list]
    full_labels = [_full_month_label(y, m, span_years) for y, m in month_list]

    name_width = max(len("PGC"), max((len(r.pgc) for r in records), default=3))
    month_width = 5
    best_width = max(len("Best Month"), max((len(lbl) for lbl in full_labels), default=0))
    total_width = max(len("Total"), 6)

    header_cells = [f"{'PGC':<{name_width}}"]
    header_cells.extend(f"{lbl:>{month_width}}" for lbl in short_labels)
    header_cells.append(f"{'Best Month':<{best_width}}")
    header_cells.append(f"{'Total':>{total_width}}")
    header = " | ".join(header_cells)
    separator = "-+-".join(
        ["-" * name_width, *("-" * month_width for _ in short_labels), "-" * best_width, "-" * total_width]
    )

    lines = [header, separator]
    visible = sort_order[:max_rows]
    for idx in visible:
        record = records[idx]
        row_scores = score_matrix[idx]
        cells = [f"{record.pgc:<{name_width}}"]
        cells.extend(f"{int(round(score)):>{month_width}d}" for score in row_scores)
        cells.append(f"{_best_month_label(row_scores, full_labels):<{best_width}}")
        cells.append(f"{int(round(row_scores.sum())):>{total_width}d}")
        lines.append(" | ".join(cells))

    if len(records) > max_rows:
        lines.append(f"… {len(records) - max_rows} more rows in the CSV export …")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------


def score_galaxies(
    latitude_deg: float,
    longitude_deg: float,
    *,
    data_path: Path = DEFAULT_DATA_PATH,
    start: date | None = None,
    night_precision: int = DEFAULT_NIGHT_PRECISION,
    month_precision: int = DEFAULT_MONTH_PRECISION,
    window_months: int = DEFAULT_WINDOW_MONTHS,
    compute_nonstandard: bool = False,
    min_angular_size_arcmin: float = 0.0,
) -> tuple[
    list[GalaxyRecord],
    list[str],
    np.ndarray,
    list[tuple[int, int]],
    list[PivotInfo],
    str,
]:
    """End-to-end scoring pipeline — mirrors ``score_constellations`` step-for-step.

    Returns
    -------
    records : list of GalaxyRecord
        Surviving galaxies after streaming filters, in original CSV order.
    metadata_columns : list of str
        Original CSV column labels for the metadata tail (used by ``export_csv``).
    score_matrix : numpy.ndarray
        ``(N_records, window_months)`` monthly score matrix.
    month_list : list of tuple of (int, int)
        ``(year, month)`` pairs covered by the window.
    pivot_infos : list of PivotInfo
        Per-timestamp metadata for the CSV pivot log.
    tz_label : str
        IANA timezone name used for pivot timestamp formatting.
    """
    total_timestamps = window_months * month_precision * night_precision

    print(f"[1/5] Loading galaxy catalogue from {data_path.name}...", file=sys.stderr)
    records, metadata_columns, counts = stream_galaxy_records(
        data_path,
        latitude_deg,
        compute_nonstandard=compute_nonstandard,
        min_angular_size_arcmin=min_angular_size_arcmin,
    )
    print(
        f"      Streamed {counts['total']} rows; "
        f"{counts['objtype_filter_kept']} after objtype filter; "
        f"{counts['kept']} after angular-size + declination filters.",
        file=sys.stderr,
    )

    print(f"[2/5] Building observer ({latitude_deg:+.4f}°, {longitude_deg:+.4f}°)...", file=sys.stderr)
    observer, location = build_observer(latitude_deg, longitude_deg)
    local_tz, tz_label = get_local_timezone(latitude_deg, longitude_deg)
    print(f"      Local timezone: {tz_label}.", file=sys.stderr)

    print(
        f"[3/5] Precomputing twilight windows "
        f"({window_months} month(s) × {month_precision} day(s)/month × "
        f"{night_precision} pivot(s)/night = {total_timestamps} timestamps)...",
        file=sys.stderr,
    )
    month_list = get_month_list(start=start, n_months=window_months)
    times_array, valid_mask, pivot_infos = precompute_all_timestamps(
        observer,
        month_list,
        night_precision=night_precision,
        month_precision=month_precision,
        local_tz=local_tz,
    )

    if not records:
        # Nothing rises from this latitude (or the file was empty after
        # filters). Return an empty score matrix so the CSV export still
        # produces a valid two-section file.
        score_matrix = np.zeros((0, window_months), dtype=float)
        return records, metadata_columns, score_matrix, month_list, pivot_infos, tz_label

    coords = _records_to_skycoord(records)

    print(
        f"[4/5] Computing altitudes ({len(records)} galaxies × {total_timestamps} timestamps)...",
        file=sys.stderr,
    )
    altitudes = compute_all_altitudes(coords, times_array, location)
    print(f"      Altitude matrix: {altitudes.shape[0]}×{altitudes.shape[1]}.", file=sys.stderr)

    print("[5/5] Scoring and aggregating monthly totals...", file=sys.stderr)
    per_timestamp_scores = compute_scores(altitudes, valid_mask)
    score_matrix = aggregate_monthly(
        per_timestamp_scores, window_months, month_precision, night_precision
    )
    print("      Done.\n", file=sys.stderr)

    return records, metadata_columns, score_matrix, month_list, pivot_infos, tz_label


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _parse_window_arg(value: str) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        raise argparse.ArgumentTypeError(
            f"--window must be an integer between 1 and {MAX_WINDOW_MONTHS} (got {value!r})"
        ) from None
    if not 1 <= n <= MAX_WINDOW_MONTHS:
        raise argparse.ArgumentTypeError(
            f"--window must be between 1 and {MAX_WINDOW_MONTHS} (got {n})"
        )
    return n


def _parse_bool_arg(value: str) -> bool:
    return str(value).strip().lower() in ("true", "1", "yes", "y", "on")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Score PGC galaxies by visibility for the next N months.",
    )
    parser.add_argument("--lat", type=float, required=True, help="Observer latitude in degrees")
    parser.add_argument("--lon", type=float, required=True, help="Observer longitude in degrees")
    parser.add_argument(
        "--export",
        choices=("csv",),
        default=None,
        help="Use 'csv' to also write a CSV file alongside the console preview.",
    )
    parser.add_argument(
        "--data",
        type=Path,
        default=DEFAULT_DATA_PATH,
        help=f"Path to the galaxy CSV file (default: {DEFAULT_DATA_PATH})",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_CSV_PATH,
        help=f"Path for the CSV export when --export csv is used (default: {DEFAULT_CSV_PATH})",
    )
    parser.add_argument(
        "--night-precision",
        type=int,
        default=DEFAULT_NIGHT_PRECISION,
        metavar="N",
        help=f"Pivot times per night (default: {DEFAULT_NIGHT_PRECISION}).",
    )
    parser.add_argument(
        "--month-precision",
        type=int,
        default=DEFAULT_MONTH_PRECISION,
        metavar="N",
        help=f"Pivot days per month (default: {DEFAULT_MONTH_PRECISION}).",
    )
    parser.add_argument(
        "--window",
        type=_parse_window_arg,
        default=DEFAULT_WINDOW_MONTHS,
        metavar="N",
        help=(
            f"Number of upcoming calendar months to score "
            f"(default: {DEFAULT_WINDOW_MONTHS}, allowed: 1..{MAX_WINDOW_MONTHS})."
        ),
    )
    parser.add_argument(
        "--compute-nonstandard",
        type=_parse_bool_arg,
        default=False,
        metavar="true|false",
        help="If true, score every objtype. If false (default), only objtype == 'G'.",
    )
    parser.add_argument(
        "--min-angular-size",
        type=float,
        default=0.0,
        metavar="ARCMIN",
        help=(
            "Keep only galaxies where major_arcmin > ARCMIN or minor_arcmin > ARCMIN. "
            "0.0 (default) disables the filter."
        ),
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable INFO-level logging to stderr.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    logging.basicConfig(
        level=logging.INFO if args.verbose else logging.WARNING,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    records, metadata_columns, score_matrix, month_list, pivot_infos, tz_label = score_galaxies(
        latitude_deg=args.lat,
        longitude_deg=args.lon,
        data_path=args.data,
        night_precision=args.night_precision,
        month_precision=args.month_precision,
        window_months=args.window,
        compute_nonstandard=args.compute_nonstandard,
        min_angular_size_arcmin=args.min_angular_size,
    )

    if not records:
        print("No galaxies survived the filters; nothing to score.")
    else:
        # Bounded preview only — the full ranking is in the CSV export.
        print(format_table(records, score_matrix, month_list))

    if args.export == "csv":
        export_csv(
            records=records,
            metadata_columns=metadata_columns,
            score_matrix=score_matrix,
            output_path=args.output,
            pivot_infos=pivot_infos,
            month_list=month_list,
            tz_label=tz_label,
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

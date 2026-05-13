"""Constellation Visibility Scorer.

Computes a visibility score for all 88 IAU constellations across a configurable
rolling window of upcoming calendar months for a given observer location.
Higher scores indicate better
astrophotography imaging windows (zenith proximity during astronomical night).

The implementation follows the specification in
``constellation_scorer_spec.md`` and pulls constellation centers from
``assets/constellations_data.json`` (fields: ``Name``, ``CentralRAh``, ``CentralDEd``).

Run from the project root::

    python constellation_scorer.py --lat 45.0 --lon 26.0
    python constellation_scorer.py --lat 45.0 --lon 26.0 --export csv
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Venv self-bootstrap: if dependencies aren't importable but a project-local
# .venv exists, re-exec with that interpreter so `python constellation_scorer.py`
# works regardless of which python is on PATH.
# ---------------------------------------------------------------------------
def _reexec_in_venv_if_needed() -> None:
    venv_dir = Path(__file__).resolve().parent / ".venv"
    if Path(sys.prefix).resolve() == venv_dir.resolve():
        return  # already running under the project venv
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
import json
import logging
import warnings
from calendar import monthrange
from dataclasses import dataclass
from datetime import date, datetime, timezone, tzinfo
from typing import Iterable
from zoneinfo import ZoneInfo

import astropy.units as u
import numpy as np
from astroplan import Observer
from astropy.coordinates import AltAz, EarthLocation, SkyCoord
from astropy.time import Time

# ---------------------------------------------------------------------------
# Module-level constants (no magic numbers buried in logic)
# ---------------------------------------------------------------------------

#: Default location of the constellation data file relative to this script.
DEFAULT_DATA_PATH: Path = Path(__file__).parent / "assets" / "constellations_data.json"

#: Default directory for CSV outputs relative to this script.
DEFAULT_OUTPUT_DIR: Path = Path(__file__).parent / "output"

#: Default CSV output path relative to this script.
DEFAULT_CSV_PATH: Path = DEFAULT_OUTPUT_DIR / "constellation_scores.csv"

#: Maximum window length, in months, accepted by ``--window``. The next 12
#: calendar months from "now" is the longest horizon the scorer supports.
MAX_WINDOW_MONTHS: int = 12

#: Default window length, in months, when ``--window`` is omitted.
DEFAULT_WINDOW_MONTHS: int = 3

#: Pivot days per month (1st, 15th, last).
PIVOTS_PER_MONTH: int = 3

#: Pivot times per night (T1 = evening twilight end, T2 = midpoint, T3 = morning twilight start).
PIVOTS_PER_NIGHT: int = 3

#: Score awarded when a constellation sits exactly at the zenith (altitude 90 deg).
MAX_SCORE_PER_TIMESTAMP: float = 50.0

#: Altitude (deg) at zenith — used to scale altitudes into scores.
ZENITH_ALT_DEG: float = 90.0

#: Number of hours per full RA revolution — used to convert RAh to degrees.
RA_HOURS_TO_DEG: float = 15.0

#: Convenience three-letter month labels for tabular output.
MONTH_LABELS: tuple[str, ...] = (
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
)

#: Full month names for the "Best Month" column.
MONTH_NAMES: tuple[str, ...] = (
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)

logger = logging.getLogger("constellation_scorer")


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ConstellationRecord:
    """A single IAU constellation center.

    Parameters
    ----------
    name : str
        Constellation name as listed in the JSON source.
    ra_deg : float
        Right ascension of the constellation center in degrees (J2000).
    dec_deg : float
        Declination of the constellation center in degrees (J2000).
    """

    name: str
    ra_deg: float
    dec_deg: float


@dataclass(frozen=True)
class PivotInfo:
    """Metadata for one pivot timestamp, written to the CSV pivot log.

    Parameters
    ----------
    dt_str : str
        Local-time datetime formatted as ``"YYYY.MM.DD HH:MM"``. Empty string
        when the pivot is a placeholder (no astronomical night that night).
    label : str
        ``"astronomical night start"``, ``"astronomical night end"``, or ``""``
        for interior pivot times and single-pivot nights.
    is_valid : bool
        ``False`` when no astronomical night existed and a placeholder was used;
        these rows are omitted from the CSV pivot section.
    """

    dt_str: str
    label: str
    is_valid: bool


def load_constellations(data_path: Path = DEFAULT_DATA_PATH) -> list[ConstellationRecord]:
    """Load constellation centers from the project JSON file.

    Parameters
    ----------
    data_path : Path, optional
        Location of the JSON file. Defaults to ``assets/constellations_data.json``.

    Returns
    -------
    list of ConstellationRecord
        One entry per constellation, preserving the JSON file's ordering. The
        original index is significant: it is used to reinsert pre-filtered
        (never-visible) constellations as zero rows in the final report.

    Notes
    -----
    The JSON file stores the IAU centroid right ascension in *hours* (``CentralRAh``)
    and declination in *degrees* (``CentralDEd``). RA is converted to degrees here
    so callers always work in degrees.
    """
    if not data_path.is_file():
        raise FileNotFoundError(f"Constellation data file not found: {data_path}")

    with data_path.open("r", encoding="utf-8") as fh:
        payload = json.load(fh)

    raw_entries = payload.get("Constellations")
    if not isinstance(raw_entries, list) or not raw_entries:
        raise ValueError(f"Malformed constellation data in {data_path}: expected non-empty 'Constellations' list")

    records: list[ConstellationRecord] = []
    for entry in raw_entries:
        # The JSON uses RAh (hours) for RA and DEd (degrees) for declination.
        records.append(
            ConstellationRecord(
                name=str(entry["Name"]),
                ra_deg=float(entry["CentralRAh"]) * RA_HOURS_TO_DEG,
                dec_deg=float(entry["CentralDEd"]),
            )
        )

    logger.info("Loaded %d constellations from %s", len(records), data_path)
    return records


# ---------------------------------------------------------------------------
# Observer + month/pivot helpers
# ---------------------------------------------------------------------------


def build_observer(latitude_deg: float, longitude_deg: float) -> tuple[Observer, EarthLocation]:
    """Construct the ``astroplan`` observer and its underlying ``EarthLocation``.

    Parameters
    ----------
    latitude_deg : float
        Observer latitude in degrees (positive = north).
    longitude_deg : float
        Observer longitude in degrees (positive = east).

    Returns
    -------
    observer : Observer
        ``astroplan`` observer used for twilight calculations.
    location : EarthLocation
        ``astropy`` location used when constructing the ``AltAz`` frame.
    """
    location = EarthLocation(lat=latitude_deg * u.deg, lon=longitude_deg * u.deg)
    observer = Observer(location=location)
    return observer, location


def get_local_timezone(latitude_deg: float, longitude_deg: float) -> tuple[tzinfo, str]:
    """Return the local timezone and its IANA name for the given coordinates.

    Falls back to UTC with a warning if ``timezonefinder`` is not installed or
    the coordinates fall in international waters with no assigned timezone.

    Parameters
    ----------
    latitude_deg : float
        Observer latitude in degrees.
    longitude_deg : float
        Observer longitude in degrees.

    Returns
    -------
    tz : tzinfo
        A ``ZoneInfo`` instance for the local timezone, or ``timezone.utc``.
    tz_label : str
        Human-readable label for the CSV header (e.g. ``"Europe/Bucharest"``).
    """
    try:
        from timezonefinder import TimezoneFinder  # soft dependency
        tz_name = TimezoneFinder().timezone_at(lng=longitude_deg, lat=latitude_deg)
        if tz_name:
            return ZoneInfo(tz_name), tz_name
        logger.warning("No timezone found for (%.4f, %.4f); using UTC", latitude_deg, longitude_deg)
    except ImportError:
        logger.warning(
            "timezonefinder not installed — pivot timestamps will use UTC. "
            "Install with: pip install timezonefinder"
        )
    return timezone.utc, "UTC"


def get_month_list(
    start: date | None = None,
    n_months: int = DEFAULT_WINDOW_MONTHS,
) -> list[tuple[int, int]]:
    """Return ``(year, month)`` tuples for the next ``n_months`` calendar months.

    Parameters
    ----------
    start : date, optional
        Reference date. Defaults to today (UTC). The reference month is
        included as the first entry, and the list runs forward ``n_months``.
    n_months : int, optional
        Window length in months. Must satisfy ``1 <= n_months <= MAX_WINDOW_MONTHS``.

    Returns
    -------
    list of tuple of (int, int)
        ``n_months`` ``(year, month)`` pairs in chronological order.
    """
    if not 1 <= n_months <= MAX_WINDOW_MONTHS:
        raise ValueError(
            f"n_months must be between 1 and {MAX_WINDOW_MONTHS}, got {n_months}"
        )

    if start is None:
        start = datetime.now(tz=timezone.utc).date()

    months: list[tuple[int, int]] = []
    year, month = start.year, start.month
    for _ in range(n_months):
        months.append((year, month))
        # Advance to next month with wrap-around at year boundary.
        month += 1
        if month > 12:
            month = 1
            year += 1
    return months


def get_pivot_days(year: int, month: int, n_pivots: int = PIVOTS_PER_MONTH) -> list[date]:
    """Return ``n_pivots`` evenly spaced days across the given month.

    Parameters
    ----------
    year : int
        Calendar year.
    month : int
        Calendar month (1-12).
    n_pivots : int, optional
        Number of pivot days. Must be >= 1. Defaults to :data:`PIVOTS_PER_MONTH`.
        Pivot days are evenly spaced across ``[1, last_day]`` inclusive using
        ``round(1 + (last_day - 1) * i / (n_pivots - 1))``.
        For ``n_pivots == 1`` the single pivot is the approximate mid-month day.

    Returns
    -------
    list of date
        ``n_pivots`` pivot dates in chronological order. Duplicates are removed
        (can occur for very high ``n_pivots`` in short months), so the actual
        count may be less than requested in degenerate cases.
    """
    last_day = monthrange(year, month)[1]
    if n_pivots == 1:
        return [date(year, month, max(1, round(last_day / 2)))]
    seen: set[int] = set()
    days: list[date] = []
    for i in range(n_pivots):
        # Evenly space n_pivots points across [1, last_day] inclusive.
        day = round(1 + (last_day - 1) * i / (n_pivots - 1))
        day = max(1, min(last_day, day))
        if day not in seen:
            seen.add(day)
            days.append(date(year, month, day))
    return days


# ---------------------------------------------------------------------------
# Twilight pivot timestamps
# ---------------------------------------------------------------------------


def compute_pivot_times(
    observer: Observer, pivot_date: date, n_pivots: int = PIVOTS_PER_NIGHT
) -> list[Time | None]:
    """Compute ``n_pivots`` evenly spaced times spanning the astronomical night.

    Parameters
    ----------
    observer : Observer
        Observer for whom to compute astronomical twilight.
    pivot_date : date
        Calendar date used as a noon-UTC reference. ``which="next"`` finds the
        upcoming evening twilight after that noon.
    n_pivots : int, optional
        Number of pivot times per night. Must be >= 1. Defaults to
        :data:`PIVOTS_PER_NIGHT`.

        * ``n_pivots == 1``: single midpoint between twilight start and end.
        * ``n_pivots == 2``: start and end only.
        * ``n_pivots >= 3``: start, ``n_pivots - 2`` equally spaced interior
          times, end.

    Returns
    -------
    list of (Time or None)
        Length ``n_pivots``. All elements are ``None`` when no astronomical
        night exists on this date (polar summer / high latitude).

    Notes
    -----
    ``astroplan`` raises ``TargetNeverUpWarning`` and returns a masked Time
    when there is no astronomical night. We swallow those warnings here and
    convert masked results to ``None`` so downstream code can score them as zero.
    """
    # Use noon UTC as a stable reference: "next" twilight from local noon is
    # always tonight's twilight regardless of timezone.
    noon = Time(f"{pivot_date.isoformat()}T12:00:00", scale="utc")

    with warnings.catch_warnings():
        # Polar summer / winter — astroplan emits warnings instead of raising.
        warnings.simplefilter("ignore")
        t_start = observer.twilight_evening_astronomical(noon, which="next")
        t_end = observer.twilight_morning_astronomical(noon, which="next")

    t_start_valid = _safe_time(t_start)
    t_end_valid = _safe_time(t_end)

    if t_start_valid is None or t_end_valid is None:
        return [None] * n_pivots

    if n_pivots == 1:
        # Single pivot: midpoint of the night.
        t_mid_jd = (t_start_valid.jd + t_end_valid.jd) / 2.0
        return [Time(t_mid_jd, format="jd", scale="utc")]

    # n_pivots >= 2: evenly space from start (i=0) to end (i=n-1) in JD.
    pivots: list[Time] = []
    for i in range(n_pivots):
        jd = t_start_valid.jd + (t_end_valid.jd - t_start_valid.jd) * i / (n_pivots - 1)
        pivots.append(Time(jd, format="jd", scale="utc"))
    return pivots


def _safe_time(value: Time | None) -> Time | None:
    """Return ``value`` only if it is a usable, finite ``Time`` instance.

    ``astroplan`` may return ``None``, a masked ``Time`` (``value.mask``), or a
    scalar with a ``NaN`` JD when no astronomical night exists. All of those
    cases are funnelled to ``None`` here so the caller has a single check.
    """
    if value is None:
        return None
    # Masked Time arrays expose a `.mask` attribute that is True when invalid.
    mask = getattr(value, "mask", None)
    if mask is not None and bool(np.all(mask)):
        return None
    try:
        if not np.isfinite(value.jd):
            return None
    except (TypeError, ValueError):
        # Non-scalar or otherwise unusable — treat as missing.
        return None
    return value


def precompute_all_timestamps(
    observer: Observer,
    month_list: list[tuple[int, int]],
    night_precision: int = PIVOTS_PER_NIGHT,
    month_precision: int = PIVOTS_PER_MONTH,
    local_tz: tzinfo = timezone.utc,
) -> tuple[Time, np.ndarray, list[PivotInfo]]:
    """Compute all pivot timestamps, a validity mask, and per-pivot metadata.

    Parameters
    ----------
    observer : Observer
        Astroplan observer.
    month_list : list of tuple of (int, int)
        ``(year, month)`` pairs as returned by :func:`get_month_list`.
    night_precision : int, optional
        Number of pivot times per night. See :func:`compute_pivot_times`.
    month_precision : int, optional
        Number of pivot days per month. See :func:`get_pivot_days`.

    Returns
    -------
    times_array : Time
        Astropy ``Time`` array of length
        ``12 * month_precision * night_precision``. Missing pivots (no
        astronomical night) are filled with a placeholder noon-UTC time so the
        AltAz transform can still vectorize; their score is zeroed via
        ``valid_mask``.
    valid_mask : numpy.ndarray
        Boolean array of the same length. ``True`` where the pivot is real.
    pivot_infos : list of PivotInfo
        One entry per timestamp, used to write the CSV pivot log.
    """
    n_months = len(month_list)
    total_timestamps = n_months * month_precision * night_precision
    raw_times: list[Time] = []
    valid_flags: list[bool] = []
    pivot_infos: list[PivotInfo] = []

    for i, (year, month) in enumerate(month_list):
        print(
            f"\r  month {i + 1:2d}/{n_months}: {MONTH_NAMES[month - 1]} {year}...",
            end="",
            flush=True,
            file=sys.stderr,
        )
        for pivot_day in get_pivot_days(year, month, month_precision):
            pivot_times = compute_pivot_times(observer, pivot_day, night_precision)
            for pivot_idx, pivot_time in enumerate(pivot_times):
                # Label the boundary pivots; interior ones and single-pivot nights get "".
                if night_precision > 1 and pivot_idx == 0:
                    label = "astronomical night start"
                elif night_precision > 1 and pivot_idx == night_precision - 1:
                    label = "astronomical night end"
                else:
                    label = ""

                if pivot_time is None:
                    # Placeholder keeps the array shape intact; mask zeroes the score.
                    placeholder = Time(f"{pivot_day.isoformat()}T12:00:00", scale="utc")
                    raw_times.append(placeholder)
                    valid_flags.append(False)
                    pivot_infos.append(PivotInfo(dt_str="", label="", is_valid=False))
                else:
                    raw_times.append(pivot_time)
                    valid_flags.append(True)
                    dt_str = pivot_time.to_datetime(timezone=local_tz).strftime("%Y.%m.%d %H:%M")
                    pivot_infos.append(PivotInfo(dt_str=dt_str, label=label, is_valid=True))

    # Overwrite the progress line with a completion message.
    print(f"\r  {total_timestamps} timestamps ready.                              ", file=sys.stderr)

    if len(raw_times) != total_timestamps:
        raise RuntimeError(
            f"Expected {total_timestamps} pivot timestamps, got {len(raw_times)}"
        )

    # Time(list_of_Time) concatenates into a single 1-D Time array.
    times_array = Time(raw_times)
    valid_mask = np.asarray(valid_flags, dtype=bool)

    n_valid = int(valid_mask.sum())
    logger.info("Precomputed %d/%d valid pivot timestamps", n_valid, total_timestamps)
    return times_array, valid_mask, pivot_infos


# ---------------------------------------------------------------------------
# Filtering + AltAz transform + scoring
# ---------------------------------------------------------------------------


def is_potentially_visible(dec_deg: float, observer_lat_deg: float) -> bool:
    """Return ``True`` if a target at ``dec_deg`` can rise from ``observer_lat_deg``.

    Parameters
    ----------
    dec_deg : float
        Target declination in degrees.
    observer_lat_deg : float
        Observer latitude in degrees.

    Returns
    -------
    bool
        Whether the target ever crosses the local horizon. A target with
        declination below ``-(90 - |lat|)`` from the northern hemisphere
        (or above ``+(90 - |lat|)`` from the southern hemisphere) is
        permanently below the horizon.
    """
    # Mirrored bound: from the equator (lat=0) everything is visible; from
    # either pole only same-hemisphere targets ever rise.
    if observer_lat_deg >= 0:
        return dec_deg > -(ZENITH_ALT_DEG - abs(observer_lat_deg))
    return dec_deg < (ZENITH_ALT_DEG - abs(observer_lat_deg))


def is_circumpolar(dec_deg: float, observer_lat_deg: float) -> bool:
    """Return ``True`` if a target at ``dec_deg`` never sets from ``observer_lat_deg``.

    A target is circumpolar when its declination places it at least the
    observer's co-latitude (``90 - |lat|``) above the celestial equator on the
    observer's own hemisphere. From the equator nothing is circumpolar (every
    target rises and sets); from either pole every same-hemisphere target is
    circumpolar.

    For a northern observer this picks out high-declination targets (Ursa
    Minor, Draco, Cepheus, …); for a southern observer it picks out
    low-declination ones near the south celestial pole.
    """
    if observer_lat_deg >= 0:
        return dec_deg >= (ZENITH_ALT_DEG - abs(observer_lat_deg))
    return dec_deg <= -(ZENITH_ALT_DEG - abs(observer_lat_deg))


def compute_circumpolar_flags(
    constellations: list[ConstellationRecord], observer_lat_deg: float
) -> np.ndarray:
    """Boolean ``(N,)`` array marking constellations that never set, aligned with input order."""
    return np.array(
        [is_circumpolar(c.dec_deg, observer_lat_deg) for c in constellations],
        dtype=bool,
    )


def filter_constellations(
    constellations: list[ConstellationRecord], observer_lat_deg: float
) -> tuple[list[int], list[int]]:
    """Partition constellation indices into visible vs. excluded.

    Parameters
    ----------
    constellations : list of ConstellationRecord
        All 88 constellations, in their original ordering.
    observer_lat_deg : float
        Observer latitude in degrees.

    Returns
    -------
    visible_indices : list of int
        Indices into ``constellations`` for targets that may rise.
    excluded_indices : list of int
        Indices for permanently-below-horizon targets. These will be
        re-inserted as zero rows in the final report.
    """
    visible_indices: list[int] = []
    excluded_indices: list[int] = []
    for idx, record in enumerate(constellations):
        if is_potentially_visible(record.dec_deg, observer_lat_deg):
            visible_indices.append(idx)
        else:
            excluded_indices.append(idx)
    return visible_indices, excluded_indices


def compute_all_altitudes(
    coords: SkyCoord, times_array: Time, location: EarthLocation
) -> np.ndarray:
    """Compute altitudes for every constellation at every pivot timestamp.

    Parameters
    ----------
    coords : SkyCoord
        ICRS centers of the visible constellations, shape ``(N,)``.
    times_array : Time
        Pivot timestamps, shape ``(T,)`` (T = 108 by default).
    location : EarthLocation
        Observer location.

    Returns
    -------
    numpy.ndarray
        Altitudes in degrees with shape ``(N, T)``. Falls back to a per-row
        loop if the version of astropy in use does not support broadcasted
        ``transform_to`` against an ``AltAz`` frame.
    """
    altaz_frame = AltAz(obstime=times_array, location=location)

    try:
        # Preferred path: one transform call for all (N, T) combinations.
        altaz_coords = coords[:, np.newaxis].transform_to(altaz_frame)
        altitudes = np.asarray(altaz_coords.alt.to_value(u.deg))
    except (ValueError, TypeError, IndexError) as exc:
        # Some astropy versions don't broadcast SkyCoord against a vector
        # AltAz frame. Fall back to looping per constellation but keep the
        # per-timestamp vectorization, which is where most of the cost lives.
        logger.warning("Batched AltAz broadcast failed (%s); falling back to per-target loop", exc)
        altitudes = np.empty((coords.shape[0], times_array.shape[0]), dtype=float)
        for idx in range(coords.shape[0]):
            altaz_coords = coords[idx].transform_to(altaz_frame)
            altitudes[idx, :] = altaz_coords.alt.to_value(u.deg)

    return altitudes


def compute_scores(altitudes: np.ndarray, valid_mask: np.ndarray) -> np.ndarray:
    """Convert altitudes into per-timestamp visibility scores.

    Parameters
    ----------
    altitudes : numpy.ndarray
        Altitudes in degrees, shape ``(N, T)``.
    valid_mask : numpy.ndarray
        Boolean array of shape ``(T,)``; ``False`` zeroes out that timestamp
        across all constellations (e.g. polar summer with no real night).

    Returns
    -------
    numpy.ndarray
        Per-timestamp scores, shape ``(N, T)``. Range per timestamp is
        ``[0, MAX_SCORE_PER_TIMESTAMP]``.
    """
    # Below the horizon => 0; otherwise a linear ramp to MAX at zenith.
    raw_scores = np.where(
        altitudes > 0.0,
        (altitudes / ZENITH_ALT_DEG) * MAX_SCORE_PER_TIMESTAMP,
        0.0,
    )
    # Broadcast (T,) mask over the constellation axis.
    return raw_scores * valid_mask[np.newaxis, :]


def aggregate_monthly(
    scores: np.ndarray,
    n_months: int,
    month_precision: int = PIVOTS_PER_MONTH,
    night_precision: int = PIVOTS_PER_NIGHT,
) -> np.ndarray:
    """Collapse the flat ``(N, T)`` score array into ``(N, n_months)`` monthly totals.

    Parameters
    ----------
    scores : numpy.ndarray
        Per-timestamp scores, shape ``(N, n_months * month_precision * night_precision)``.
    n_months : int
        Window length in months — must match the value used when building the
        timestamps.
    month_precision : int, optional
        Number of pivot days per month used when building the timestamps.
    night_precision : int, optional
        Number of pivot times per night used when building the timestamps.

    Returns
    -------
    numpy.ndarray
        Per-month totals, shape ``(N, n_months)``. The reshape order
        ``(N, n_months, month_precision, night_precision)`` mirrors how
        :func:`precompute_all_timestamps` lays out months × nights × pivots.
    """
    n_targets = scores.shape[0]
    reshaped = scores.reshape(n_targets, n_months, month_precision, night_precision)
    return reshaped.sum(axis=(2, 3))


# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------


def build_full_score_matrix(
    monthly_scores: np.ndarray, visible_indices: list[int], total_constellations: int
) -> np.ndarray:
    """Re-insert excluded constellations as zero rows.

    Parameters
    ----------
    monthly_scores : numpy.ndarray
        Scores for visible constellations, shape ``(N_visible, n_months)``.
    visible_indices : list of int
        Original indices of the visible constellations.
    total_constellations : int
        Total number of constellations (88 for the IAU set).

    Returns
    -------
    numpy.ndarray
        Full score matrix of shape ``(total_constellations, n_months)`` aligned
        with the original constellation ordering.
    """
    n_months = monthly_scores.shape[1]
    full = np.zeros((total_constellations, n_months), dtype=float)
    for visible_idx, source_row in zip(visible_indices, monthly_scores, strict=True):
        full[visible_idx, :] = source_row
    return full


def _short_month_label(year: int, month: int, span_years: bool) -> str:
    """Three-letter month abbrev, suffixed with two-digit year when window spans years."""
    base = MONTH_LABELS[month - 1]
    return f"{base} '{year % 100:02d}" if span_years else base


def _full_month_label(year: int, month: int, span_years: bool) -> str:
    """Full month name, suffixed with year when window spans more than one year."""
    base = MONTH_NAMES[month - 1]
    return f"{base} {year}" if span_years else base


def _best_month_label(row: np.ndarray, month_labels: Iterable[str]) -> str:
    """Return the label for the highest-scoring month, or ``"N/A"`` if all zero."""
    if float(row.sum()) <= 0.0:
        return "N/A"
    # argmax returns the first index of the max — fine for ties.
    best_idx = int(np.argmax(row))
    labels = list(month_labels)
    return labels[best_idx]


def format_table(
    constellations: list[ConstellationRecord],
    score_matrix: np.ndarray,
    month_list: list[tuple[int, int]],
    circumpolar_flags: np.ndarray | None = None,
) -> str:
    """Render the full scored table as a fixed-width string.

    Parameters
    ----------
    constellations : list of ConstellationRecord
        All constellations in original order.
    score_matrix : numpy.ndarray
        Shape ``(N, len(month_list))`` monthly score matrix.
    month_list : list of (int, int)
        ``(year, month)`` pairs describing each column of ``score_matrix``.
    circumpolar_flags : numpy.ndarray or None, optional
        Boolean ``(N,)`` array (aligned with ``constellations``). Adds a
        ``Circ.`` column with ``yes`` / ``-`` markers when supplied.

    Returns
    -------
    str
        Multi-line table sorted by total (descending). Includes one column per
        month in ``month_list`` plus ``Best Month``, ``Total``, and (when
        ``circumpolar_flags`` is supplied) ``Circ.``.
    """
    annual_totals = score_matrix.sum(axis=1)
    # Stable sort so ties preserve the JSON ordering — easier to eyeball.
    sort_order = np.argsort(-annual_totals, kind="stable")

    span_years = len({y for y, _ in month_list}) > 1
    short_labels = [_short_month_label(y, m, span_years) for y, m in month_list]
    full_labels = [_full_month_label(y, m, span_years) for y, m in month_list]

    name_width = max(len("Constellation"), max(len(c.name) for c in constellations))
    month_width = max((len(lbl) for lbl in short_labels), default=5)
    month_width = max(month_width, 5)  # accommodate three-digit scores
    best_width = max(len("Best Month"), max((len(lbl) for lbl in full_labels), default=0))
    total_label = "Total"
    total_width = max(len(total_label), 6)
    circ_width = len("Circ.")

    header_cells: list[str] = [f"{'Constellation':<{name_width}}"]
    header_cells.extend(f"{label:>{month_width}}" for label in short_labels)
    header_cells.append(f"{'Best Month':<{best_width}}")
    header_cells.append(f"{total_label:>{total_width}}")
    if circumpolar_flags is not None:
        header_cells.append(f"{'Circ.':<{circ_width}}")
    header = " | ".join(header_cells)

    separator_cells: list[str] = ["-" * name_width]
    separator_cells.extend("-" * month_width for _ in short_labels)
    separator_cells.append("-" * best_width)
    separator_cells.append("-" * total_width)
    if circumpolar_flags is not None:
        separator_cells.append("-" * circ_width)
    separator = "-+-".join(separator_cells)

    rows: list[str] = [header, separator]
    for idx in sort_order:
        record = constellations[idx]
        row_scores = score_matrix[idx]
        cells: list[str] = [f"{record.name:<{name_width}}"]
        cells.extend(f"{int(round(score)):>{month_width}d}" for score in row_scores)
        cells.append(f"{_best_month_label(row_scores, full_labels):<{best_width}}")
        cells.append(f"{int(round(row_scores.sum())):>{total_width}d}")
        if circumpolar_flags is not None:
            marker = "yes" if bool(circumpolar_flags[idx]) else "-"
            cells.append(f"{marker:<{circ_width}}")
        rows.append(" | ".join(cells))

    return "\n".join(rows)


def export_csv(
    constellations: list[ConstellationRecord],
    score_matrix: np.ndarray,
    output_path: Path,
    pivot_infos: list[PivotInfo],
    month_list: list[tuple[int, int]],
    circumpolar_flags: np.ndarray | None = None,
    tz_label: str = "UTC",
) -> None:
    """Write the scored table and pivot log to a CSV file.

    The file has two sections separated by a blank row:

    1. **Scores table** — one row per constellation, sorted by annual total.
       Includes a trailing ``Circumpolar`` column (``true`` / ``false``) when
       ``circumpolar_flags`` is supplied.
    2. **Pivot timestamps** — one row per valid pivot used in the computation,
       with labels for astronomical night start/end boundaries.

    Parameters
    ----------
    constellations : list of ConstellationRecord
        All constellations in original order.
    score_matrix : numpy.ndarray
        Shape ``(N, 12)`` monthly score matrix.
    output_path : Path
        Destination CSV file. Overwritten if it already exists.
    pivot_infos : list of PivotInfo
        Per-timestamp metadata returned by :func:`precompute_all_timestamps`.
        Invalid (placeholder) entries are skipped.
    circumpolar_flags : numpy.ndarray or None, optional
        Boolean ``(N,)`` array (aligned with ``constellations``). When supplied,
        an extra ``Circumpolar`` column is appended to the scores table.
    """
    annual_totals = score_matrix.sum(axis=1)
    sort_order = np.argsort(-annual_totals, kind="stable")

    span_years = len({y for y, _ in month_list}) > 1
    short_labels = [_short_month_label(y, m, span_years) for y, m in month_list]
    full_labels = [_full_month_label(y, m, span_years) for y, m in month_list]

    output_path.parent.mkdir(parents=True, exist_ok=True)
    # utf-8-sig + a leading "sep=," hint line make the file open with the
    # correct delimiter on a double-click in Apple Numbers / Excel even on
    # locales where the system list separator is ";" (e.g. ro_RO, de_DE).
    with output_path.open("w", encoding="utf-8-sig", newline="") as fh:
        fh.write("sep=,\r\n")
        writer = csv.writer(fh)

        # --- Section 1: scores table ---
        header_row: list[str] = ["Constellation", *short_labels, "Best Month", "Total"]
        if circumpolar_flags is not None:
            header_row.append("Circumpolar")
        writer.writerow(header_row)
        for idx in sort_order:
            record = constellations[idx]
            row_scores = score_matrix[idx]
            row_cells: list[object] = [
                record.name,
                *[round(float(score), 2) for score in row_scores],
                _best_month_label(row_scores, full_labels),
                round(float(row_scores.sum()), 2),
            ]
            if circumpolar_flags is not None:
                row_cells.append("true" if bool(circumpolar_flags[idx]) else "false")
            writer.writerow(row_cells)

        # --- Section 2: pivot timestamps ---
        writer.writerow([])
        writer.writerow(["# Pivot Timestamps"])
        writer.writerow([f"Timestamp ({tz_label})", "Note"])
        for info in pivot_infos:
            if info.is_valid:
                writer.writerow([info.dt_str, info.label])

    logger.info("Wrote CSV report to %s", output_path)


def export_debug_csv(
    record: ConstellationRecord,
    pivot_infos: list[PivotInfo],
    valid_mask: np.ndarray,
    altitudes: np.ndarray,
    azimuths: np.ndarray,
    scores: np.ndarray,
    output_path: Path,
    latitude_deg: float,
    longitude_deg: float,
    tz_label: str,
) -> None:
    """Write a per-timestamp debug CSV for a single constellation.

    Every pivot slot appears as a row — including invalid ones (polar summer /
    no astronomical night). This gives a complete picture so results can be
    cross-checked against Stellarium at each specific timestamp.

    Parameters
    ----------
    record : ConstellationRecord
        The constellation being debugged.
    pivot_infos : list of PivotInfo
        Per-timestamp metadata from :func:`precompute_all_timestamps`.
    valid_mask : numpy.ndarray
        Boolean array of shape ``(T,)``; ``False`` = no astronomical night.
    altitudes : numpy.ndarray
        Computed altitudes in degrees, shape ``(T,)``.
    azimuths : numpy.ndarray
        Computed azimuths in degrees, shape ``(T,)``.
    scores : numpy.ndarray
        Per-timestamp scores, shape ``(T,)``.
    output_path : Path
        Destination file.
    latitude_deg, longitude_deg : float
        Observer coordinates — written to the file header.
    tz_label : str
        IANA timezone name used for timestamp formatting.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8-sig", newline="") as fh:
        fh.write("sep=,\r\n")
        writer = csv.writer(fh)

        writer.writerow([f"# Debug report: {record.name}", "", "", "", ""])
        writer.writerow([f"# Observer: {latitude_deg:+.4f}° | {longitude_deg:+.4f}° | Timezone: {tz_label}", "", "", "", ""])
        writer.writerow([f"# RA: {record.ra_deg:.4f}° | Dec: {record.dec_deg:.4f}°", "", "", "", ""])
        writer.writerow(["", "", "", "", ""])
        writer.writerow([f"Timestamp ({tz_label})", "Altitude (deg)", "Azimuth (deg)", "Score", "Note"])

        for i, info in enumerate(pivot_infos):
            if not info.is_valid:
                writer.writerow(["no astronomical night", "", "", "", ""])
            else:
                writer.writerow([
                    info.dt_str,
                    f"{altitudes[i]:.4f}",
                    f"{azimuths[i]:.4f}",
                    f"{scores[i]:.4f}",
                    info.label,
                ])

    logger.info("Wrote debug CSV to %s", output_path)


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------


def score_constellations(
    latitude_deg: float,
    longitude_deg: float,
    data_path: Path = DEFAULT_DATA_PATH,
    start: date | None = None,
    night_precision: int = PIVOTS_PER_NIGHT,
    month_precision: int = PIVOTS_PER_MONTH,
    window_months: int = DEFAULT_WINDOW_MONTHS,
) -> tuple[
    list[ConstellationRecord],
    np.ndarray,
    list[tuple[int, int]],
    list[PivotInfo],
    str,
    np.ndarray,
]:
    """End-to-end scoring pipeline.

    Parameters
    ----------
    latitude_deg : float
        Observer latitude in degrees.
    longitude_deg : float
        Observer longitude in degrees.
    data_path : Path, optional
        Path to the constellation JSON file.
    start : date, optional
        Reference date for the rolling window. Defaults to today (UTC).
    night_precision : int, optional
        Number of pivot times per night. Default 3.
    month_precision : int, optional
        Number of pivot days per month. Default 3.
    window_months : int, optional
        Number of calendar months in the report window
        (1..``MAX_WINDOW_MONTHS``). Defaults to ``DEFAULT_WINDOW_MONTHS``.

    Returns
    -------
    constellations : list of ConstellationRecord
        All 88 constellations in original ordering.
    score_matrix : numpy.ndarray
        Shape ``(88, window_months)`` monthly score matrix.
    month_list : list of tuple of (int, int)
        The ``window_months`` ``(year, month)`` pairs covered by the report.
    pivot_infos : list of PivotInfo
        Per-timestamp metadata for the CSV pivot log.
    tz_label : str
        IANA timezone name used for pivot timestamp formatting (e.g. ``"Europe/Bucharest"``).
    circumpolar_flags : numpy.ndarray
        Boolean ``(88,)`` array — ``True`` for constellations that never set at
        ``latitude_deg``. Aligned with ``constellations``.
    """
    total_timestamps = window_months * month_precision * night_precision

    print(f"[1/5] Loading constellation data from {data_path.name}...", file=sys.stderr)
    constellations = load_constellations(data_path)
    print(f"      {len(constellations)} constellations loaded.", file=sys.stderr)

    print(f"[2/5] Building observer ({latitude_deg:+.4f}°, {longitude_deg:+.4f}°)...", file=sys.stderr)
    observer, location = build_observer(latitude_deg, longitude_deg)
    local_tz, tz_label = get_local_timezone(latitude_deg, longitude_deg)
    print(f"      Local timezone: {tz_label}.", file=sys.stderr)

    visible_indices, excluded_indices = filter_constellations(constellations, latitude_deg)
    circumpolar_flags = compute_circumpolar_flags(constellations, latitude_deg)
    n_circumpolar = int(circumpolar_flags.sum())
    print(
        f"      Declination filter: {len(visible_indices)} visible, "
        f"{len(excluded_indices)} excluded, {n_circumpolar} circumpolar.",
        file=sys.stderr,
    )
    logger.info(
        "Visibility pre-filter: %d visible, %d excluded, %d circumpolar",
        len(visible_indices),
        len(excluded_indices),
        n_circumpolar,
    )

    print(
        f"[3/5] Precomputing twilight windows "
        f"({window_months} month(s) × {month_precision} day(s)/month × "
        f"{night_precision} pivot(s)/night = {total_timestamps} timestamps)...",
        file=sys.stderr,
    )
    month_list = get_month_list(start=start, n_months=window_months)
    times_array, valid_mask, pivot_infos = precompute_all_timestamps(
        observer, month_list, night_precision=night_precision, month_precision=month_precision,
        local_tz=local_tz,
    )

    if not visible_indices:
        # Edge case: observer at a pole — keep shape consistent, return empty pivot list.
        score_matrix = np.zeros((len(constellations), window_months), dtype=float)
        return constellations, score_matrix, month_list, pivot_infos, tz_label, circumpolar_flags

    visible_records = [constellations[i] for i in visible_indices]
    coords = SkyCoord(
        ra=[r.ra_deg for r in visible_records] * u.deg,
        dec=[r.dec_deg for r in visible_records] * u.deg,
        frame="icrs",
    )

    print(
        f"[4/5] Computing altitudes ({len(visible_indices)} constellations × {total_timestamps} timestamps)...",
        file=sys.stderr,
    )
    altitudes = compute_all_altitudes(coords, times_array, location)
    print(f"      Altitude matrix: {altitudes.shape[0]}×{altitudes.shape[1]}.", file=sys.stderr)

    print("[5/5] Scoring and aggregating monthly totals...", file=sys.stderr)
    per_timestamp_scores = compute_scores(altitudes, valid_mask)
    monthly_scores = aggregate_monthly(
        per_timestamp_scores, window_months, month_precision, night_precision
    )
    score_matrix = build_full_score_matrix(monthly_scores, visible_indices, len(constellations))
    print("      Done.\n", file=sys.stderr)

    return constellations, score_matrix, month_list, pivot_infos, tz_label, circumpolar_flags


def debug_constellation(
    latitude_deg: float,
    longitude_deg: float,
    constellation_name: str,
    data_path: Path,
    output_path: Path,
    night_precision: int = PIVOTS_PER_NIGHT,
    month_precision: int = PIVOTS_PER_MONTH,
    window_months: int = DEFAULT_WINDOW_MONTHS,
) -> int:
    """Run the debug pipeline for a single named constellation.

    Computes per-timestamp altitudes, azimuths, and scores for every pivot slot
    across the configured month window and writes them to a CSV for side-by-side
    verification with Stellarium or another planetarium app.

    Parameters
    ----------
    latitude_deg, longitude_deg : float
        Observer coordinates.
    constellation_name : str
        Case-insensitive name to look up in the constellation data file.
    data_path : Path
        Path to the constellation JSON file.
    output_path : Path
        Destination debug CSV file.
    night_precision, month_precision : int
        Passed through to :func:`precompute_all_timestamps`; defaults match the
        normal pipeline so debug scores are directly comparable.

    Returns
    -------
    int
        Exit code: ``0`` on success, ``1`` if the constellation name is not found.
    """
    print(f"[DEBUG] Constellation: {constellation_name!r}", file=sys.stderr)

    constellations = load_constellations(data_path)

    target = next(
        (c for c in constellations if c.name.lower() == constellation_name.lower()),
        None,
    )
    if target is None:
        available = ", ".join(c.name for c in constellations)
        print(
            f"Error: {constellation_name!r} not found in data file.\nAvailable: {available}",
            file=sys.stderr,
        )
        return 1

    print(f"[DEBUG] Matched: {target.name}  RA={target.ra_deg:.4f}°  Dec={target.dec_deg:.4f}°", file=sys.stderr)

    observer, location = build_observer(latitude_deg, longitude_deg)
    local_tz, tz_label = get_local_timezone(latitude_deg, longitude_deg)
    print(f"[DEBUG] Timezone: {tz_label}", file=sys.stderr)

    month_list = get_month_list(n_months=window_months)
    total_timestamps = window_months * month_precision * night_precision
    print(
        f"[DEBUG] Precomputing {total_timestamps} pivot timestamps "
        f"({month_precision} day(s)/month × {night_precision} pivot(s)/night)...",
        file=sys.stderr,
    )
    times_array, valid_mask, pivot_infos = precompute_all_timestamps(
        observer, month_list,
        night_precision=night_precision,
        month_precision=month_precision,
        local_tz=local_tz,
    )

    print(f"[DEBUG] Computing AltAz for {target.name}...", file=sys.stderr)
    coord = SkyCoord(ra=target.ra_deg * u.deg, dec=target.dec_deg * u.deg, frame="icrs")
    altaz_frame = AltAz(obstime=times_array, location=location)
    altaz_coords = coord.transform_to(altaz_frame)
    altitudes = np.asarray(altaz_coords.alt.to_value(u.deg))
    azimuths = np.asarray(altaz_coords.az.to_value(u.deg))

    scores = np.where(
        (altitudes > 0.0) & valid_mask,
        (altitudes / ZENITH_ALT_DEG) * MAX_SCORE_PER_TIMESTAMP,
        0.0,
    )

    export_debug_csv(
        record=target,
        pivot_infos=pivot_infos,
        valid_mask=valid_mask,
        altitudes=altitudes,
        azimuths=azimuths,
        scores=scores,
        output_path=output_path,
        latitude_deg=latitude_deg,
        longitude_deg=longitude_deg,
        tz_label=tz_label,
    )
    print(f"[DEBUG] Written → {output_path}", file=sys.stderr)
    return 0


def _parse_window_arg(value: str) -> int:
    """argparse type validator for ``--window``: accepts integers 1..MAX_WINDOW_MONTHS."""
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


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse command line arguments.

    Parameters
    ----------
    argv : list of str, optional
        Argument vector. Defaults to ``sys.argv[1:]`` when ``None``.

    Returns
    -------
    argparse.Namespace
        Parsed CLI arguments with ``lat``, ``lon``, ``export``, ``data``,
        and ``output`` attributes.
    """
    parser = argparse.ArgumentParser(
        description="Score the 88 IAU constellations by visibility for the next N months (configurable via --window).",
    )
    parser.add_argument("--lat", type=float, required=True, help="Observer latitude in degrees (positive = north)")
    parser.add_argument("--lon", type=float, required=True, help="Observer longitude in degrees (positive = east)")
    parser.add_argument(
        "--export",
        choices=("csv",),
        default=None,
        help="Optional export format. Use 'csv' to also write a CSV file.",
    )
    parser.add_argument(
        "--data",
        type=Path,
        default=DEFAULT_DATA_PATH,
        help=f"Path to the constellation JSON file (default: {DEFAULT_DATA_PATH})",
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
        default=PIVOTS_PER_NIGHT,
        metavar="N",
        help=(
            f"Pivot times per night (default: {PIVOTS_PER_NIGHT}). "
            "With N=2: night start + end only. "
            "With N>=3: start, N-2 equally spaced interior times, end."
        ),
    )
    parser.add_argument(
        "--month-precision",
        type=int,
        default=PIVOTS_PER_MONTH,
        metavar="N",
        help=(
            f"Pivot days per month (default: {PIVOTS_PER_MONTH}). "
            "Days are evenly spaced across [1, last_day] of each month."
        ),
    )
    parser.add_argument(
        "--window",
        type=_parse_window_arg,
        default=DEFAULT_WINDOW_MONTHS,
        metavar="N",
        help=(
            f"Number of upcoming calendar months to score "
            f"(default: {DEFAULT_WINDOW_MONTHS}, allowed: 1..{MAX_WINDOW_MONTHS}). "
            "The current month is the first column."
        ),
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable INFO-level logging to stderr.",
    )
    parser.add_argument(
        "--debug-mode",
        type=lambda v: v.lower() in ("true", "1", "yes"),
        default=False,
        metavar="true|false",
        help="Enable single-constellation debug mode (requires --c).",
    )
    parser.add_argument(
        "--c",
        type=str,
        default=None,
        metavar="NAME",
        help="Constellation name to debug (required when --debug-mode true).",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """Console entry point.

    Parameters
    ----------
    argv : list of str, optional
        Argument vector for testing; defaults to the process arguments.

    Returns
    -------
    int
        Exit code (``0`` for success).
    """
    args = parse_args(argv)

    logging.basicConfig(
        level=logging.INFO if args.verbose else logging.WARNING,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    if args.debug_mode:
        if not args.c:
            print("Error: --debug-mode requires --c <constellation name>", file=sys.stderr)
            return 1
        name_slug = args.c.lower().replace(" ", "_")
        debug_output = args.output.parent / f"constellation_debug_{name_slug}.csv"
        return debug_constellation(
            latitude_deg=args.lat,
            longitude_deg=args.lon,
            constellation_name=args.c,
            data_path=args.data,
            output_path=debug_output,
            night_precision=args.night_precision,
            month_precision=args.month_precision,
            window_months=args.window,
        )

    constellations, score_matrix, month_list, pivot_infos, tz_label, circumpolar_flags = (
        score_constellations(
            latitude_deg=args.lat,
            longitude_deg=args.lon,
            data_path=args.data,
            night_precision=args.night_precision,
            month_precision=args.month_precision,
            window_months=args.window,
        )
    )

    # Stdout intentionally hosts the user-facing report — it is the
    # primary output of the script, not a log message.
    table = format_table(constellations, score_matrix, month_list, circumpolar_flags)
    print(table)  # noqa: T201 - report payload, not logging

    if args.export == "csv":
        export_csv(
            constellations,
            score_matrix,
            args.output,
            pivot_infos,
            month_list,
            circumpolar_flags=circumpolar_flags,
            tz_label=tz_label,
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

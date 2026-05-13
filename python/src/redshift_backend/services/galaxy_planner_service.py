from __future__ import annotations

import asyncio
import csv
import re
import time
import uuid
from collections.abc import AsyncIterator
from pathlib import Path

import structlog

from redshift_backend.core.paths import app_data_dir, script_dispatch_prefix, scripts_dir
from redshift_backend.schemas.galaxy_planner import (
    GalaxyPlannerCalculateRequest,
    GalaxyPlannerDone,
    GalaxyPlannerErrorEvent,
    GalaxyPlannerProgress,
    GalaxyResults,
    GalaxyRow,
)
from redshift_backend.schemas.location import Location

log = structlog.get_logger(__name__)

_SCRIPT_NAME = "galaxy_scorer"
SCRIPT_PATH = scripts_dir() / f"{_SCRIPT_NAME}.py"

# Period selector → galaxy_scorer.py --window value (matches constellation planner).
PERIOD_TO_WINDOW: dict[str, int] = {
    "1 Month": 1,
    "3 Months": 3,
    "6 Months": 6,
    "One Year": 12,
}

# UI labels for each step the script emits via [N/5] markers on stderr.
STATUS_LABELS: list[str] = [
    "Loading galaxy catalogue",
    "Building observer",
    "Precomputing twilight windows",
    "Computing altitudes",
    "Scoring galaxies",
]
NUM_STEPS = len(STATUS_LABELS)
_FINAL_PROGRESS_PCT = 95.0  # leaves the last 5% for "Done" → 100% just before GalaxyPlannerDone.

_STEP_RE = re.compile(r"\[(\d)/(\d)\]")

# Keyed by (period, compute_nonstandard, min_angular_size) — single-user app,
# the latest result per (window, filter mode, size threshold) is enough for
# the UI to switch between them without recomputing.
_latest_by_key: dict[tuple[str, bool, float], GalaxyResults] = {}


class GalaxyPlannerError(Exception):
    """Raised when the calculation cannot start (missing inputs, bad period)."""


def _result_key(period: str, compute_nonstandard: bool, min_angular_size: float) -> tuple[str, bool, float]:
    return (period, compute_nonstandard, min_angular_size)


def get_latest(period: str, compute_nonstandard: bool, min_angular_size: float) -> GalaxyResults | None:
    return _latest_by_key.get(_result_key(period, compute_nonstandard, min_angular_size))


def _output_csv_path() -> Path:
    out_dir = app_data_dir() / "galaxy_planner"
    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir / "galaxy_scores.csv"


async def calculate(
    req: GalaxyPlannerCalculateRequest,
    location: Location,
) -> AsyncIterator[GalaxyPlannerProgress | GalaxyPlannerDone | GalaxyPlannerErrorEvent]:
    """Spawn galaxy_scorer.py and stream its [N/5] step markers as SSE progress.

    The endpoint is responsible for ensuring ``location`` is set before calling.
    Mid-stream failures (script exit non-zero, CSV missing/malformed) are surfaced
    as a single ``GalaxyPlannerErrorEvent`` so the frontend's onError handler can react.
    """
    window = PERIOD_TO_WINDOW.get(req.period)
    if window is None:
        yield GalaxyPlannerErrorEvent(message=f"Unsupported period: {req.period}")
        return

    if not SCRIPT_PATH.is_file():
        yield GalaxyPlannerErrorEvent(message=f"Galaxy scorer script not found at {SCRIPT_PATH}")
        return

    output_path = _output_csv_path()
    cmd = [
        *script_dispatch_prefix(),
        "--run-script", _SCRIPT_NAME,
        "--lat", f"{location.lat:.6f}",
        "--lon", f"{location.lng:.6f}",
        "--window", str(window),
        "--month-precision", str(req.month_precision),
        "--night-precision", str(req.night_precision),
        "--compute-nonstandard", "true" if req.compute_nonstandard else "false",
        "--min-angular-size", str(req.min_angular_size),
        "--export", "csv",
        "--output", str(output_path),
    ]
    log.info("galaxy_planner.calculate.start", cmd=cmd)

    started = time.monotonic()
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except OSError as exc:
        yield GalaxyPlannerErrorEvent(message=f"Could not launch galaxy scorer: {exc}")
        return

    stderr_tail: list[str] = []
    assert proc.stderr is not None
    while True:
        line_bytes = await proc.stderr.readline()
        if not line_bytes:
            break
        line = line_bytes.decode("utf-8", errors="replace").rstrip("\r\n")
        if not line:
            continue
        stderr_tail.append(line)
        if len(stderr_tail) > 40:
            stderr_tail.pop(0)

        progress = _line_to_progress(line)
        if progress is not None:
            yield progress

    return_code = await proc.wait()
    if return_code != 0:
        tail = "\n".join(stderr_tail[-12:]).strip() or f"exit code {return_code}"
        log.error("galaxy_planner.calculate.failed", return_code=return_code, tail=tail)
        yield GalaxyPlannerErrorEvent(
            message=f"Galaxy scorer failed (exit {return_code}): {tail}"
        )
        return

    runtime = time.monotonic() - started
    try:
        results = _parse_csv(output_path, runtime)
    except GalaxyPlannerError as exc:
        log.exception("galaxy_planner.calculate.parse_failed")
        yield GalaxyPlannerErrorEvent(message=str(exc))
        return

    _latest_by_key[_result_key(req.period, req.compute_nonstandard, req.min_angular_size)] = results
    log.info(
        "galaxy_planner.calculate.done",
        runtime_s=round(runtime, 2),
        rows=len(results.rows),
        compute_nonstandard=req.compute_nonstandard,
        min_angular_size=req.min_angular_size,
    )

    yield GalaxyPlannerProgress(percent=100.0, status_index=NUM_STEPS - 1, status=STATUS_LABELS[-1])
    yield GalaxyPlannerDone(result_id=str(uuid.uuid4()))


def _line_to_progress(line: str) -> GalaxyPlannerProgress | None:
    """Translate a single stderr line from the galaxy scorer into a progress event.

    Same step layout as the constellation scorer ([1/5]…[5/5]); per-month inner
    progress within step 3 is ignored — we only surface the 5 main steps.
    """
    m_step = _STEP_RE.search(line)
    if m_step is not None:
        step = int(m_step.group(1))
        if 1 <= step <= NUM_STEPS:
            pct = step / NUM_STEPS * _FINAL_PROGRESS_PCT
            return GalaxyPlannerProgress(
                percent=pct,
                status_index=step - 1,
                status=STATUS_LABELS[step - 1],
            )
    return None


def _parse_csv(path: Path, runtime_s: float) -> GalaxyResults:
    """Parse the galaxy scorer's two-section CSV into a ``GalaxyResults`` payload.

    Format (see ``galaxy_scorer.export_csv``)::

        sep=,
        pgc, <month1>, …, <monthN>, Best Month, Total, <metadata cols…>
        <pgc>, <s1>, …, <sN>, <best>, <total>, <metadata values…>
        ...
        <blank row>
        # Pivot Timestamps
        <ignored>

    The metadata tail is preserved verbatim per row so the frontend can render
    arbitrary catalogue fields in the galaxy detail popup. Cells stay as strings
    because the catalogue mixes numeric, blank, and free-text values.
    """
    if not path.is_file():
        raise GalaxyPlannerError(f"Galaxy scorer did not produce CSV at {path}")

    with path.open("r", encoding="utf-8-sig", newline="") as fh:
        reader = csv.reader(fh)
        rows = list(reader)

    if rows and rows[0] and rows[0][0].startswith("sep="):
        rows = rows[1:]

    if not rows:
        raise GalaxyPlannerError("Galaxy scorer CSV is empty")

    header = rows[0]
    if len(header) < 4 or header[0] != "pgc":
        raise GalaxyPlannerError(f"Unexpected CSV header: {header}")

    # Locate the fixed columns by name to stay robust if the metadata tail
    # ever shifts. Best Month and Total are always emitted by the script.
    try:
        best_idx = header.index("Best Month")
        total_idx = header.index("Total")
    except ValueError as exc:
        raise GalaxyPlannerError(f"CSV header missing Best Month/Total: {header}") from exc

    if best_idx <= 1 or total_idx != best_idx + 1:
        raise GalaxyPlannerError(f"Unexpected column layout in header: {header}")

    month_labels = header[1:best_idx]
    n_months = len(month_labels)
    metadata_columns = header[total_idx + 1 :]

    data_rows: list[GalaxyRow] = []
    for raw in rows[1:]:
        if not raw or not raw[0]:
            break
        if raw[0].startswith("#"):
            break
        if len(raw) < total_idx + 1:
            continue
        try:
            months = [float(cell or 0.0) for cell in raw[1 : 1 + n_months]]
            best = raw[best_idx]
            total = float(raw[total_idx] or 0.0)
        except ValueError:
            continue
        # Metadata cells may be missing for short rows — pad with empty strings.
        tail = raw[total_idx + 1 :]
        if len(tail) < len(metadata_columns):
            tail = [*tail, *[""] * (len(metadata_columns) - len(tail))]
        elif len(tail) > len(metadata_columns):
            tail = tail[: len(metadata_columns)]
        metadata = dict(zip(metadata_columns, tail, strict=True))
        data_rows.append(
            GalaxyRow(
                pgc=raw[0],
                months=months,
                best=best,
                total=total,
                metadata=metadata,
            )
        )

    if not data_rows:
        raise GalaxyPlannerError("No data rows parsed from galaxy scorer CSV")

    return GalaxyResults(
        rows=data_rows,
        months=month_labels,
        metadata_columns=metadata_columns,
        total_rows=len(data_rows),
        engine_runtime_s=round(runtime_s, 2),
    )

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
from redshift_backend.schemas.location import Location
from redshift_backend.schemas.planner import (
    PlannerBest,
    PlannerCalculateRequest,
    PlannerDone,
    PlannerErrorEvent,
    PlannerKpis,
    PlannerProgress,
    PlannerResults,
    PlannerRow,
)

log = structlog.get_logger(__name__)

_SCRIPT_NAME = "constellation_scorer"
SCRIPT_PATH = scripts_dir() / f"{_SCRIPT_NAME}.py"

# Period selector (1/3/6/12 months) → constellation_scorer.py --window value.
PERIOD_TO_WINDOW: dict[str, int] = {
    "1 Month": 1,
    "3 Months": 3,
    "6 Months": 6,
    "One Year": 12,
}

# UI labels for each step the script emits via [N/5] markers on stderr.
STATUS_LABELS: list[str] = [
    "Loading constellation data",
    "Building observer",
    "Precomputing twilight windows",
    "Computing altitudes",
    "Scoring constellations",
]
NUM_STEPS = len(STATUS_LABELS)
_FINAL_PROGRESS_PCT = 95.0  # leaves the last 5% for "Done" → 100% just before PlannerDone.

_STEP_RE = re.compile(r"\[(\d)/(\d)\]")
_MONTH_RE = re.compile(r"month\s+(\d+)\s*/\s*(\d+)")

# Keyed by period — single-user app, the latest result for each period is enough.
_latest_by_period: dict[str, PlannerResults] = {}


class PlannerError(Exception):
    """Raised when the calculation cannot start (missing inputs, bad period)."""


def get_latest(period: str) -> PlannerResults | None:
    return _latest_by_period.get(period)


def _output_csv_path() -> Path:
    out_dir = app_data_dir() / "planner"
    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir / "constellation_scores.csv"


async def calculate(
    req: PlannerCalculateRequest,
    location: Location,
) -> AsyncIterator[PlannerProgress | PlannerDone | PlannerErrorEvent]:
    """Spawn constellation_scorer.py and stream its [N/5] step markers as SSE progress.

    The endpoint is responsible for ensuring `location` is set before calling.
    Mid-stream failures (script exit non-zero, CSV missing/malformed) are surfaced
    as a single ``PlannerErrorEvent`` so the frontend's onError handler can react.
    """
    window = PERIOD_TO_WINDOW.get(req.period)
    if window is None:
        yield PlannerErrorEvent(message=f"Unsupported period: {req.period}")
        return

    if not SCRIPT_PATH.is_file():
        yield PlannerErrorEvent(message=f"Constellation scorer script not found at {SCRIPT_PATH}")
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
        "--export", "csv",
        "--output", str(output_path),
    ]
    log.info("planner.calculate.start", cmd=cmd)

    started = time.monotonic()
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except OSError as exc:
        yield PlannerErrorEvent(message=f"Could not launch constellation scorer: {exc}")
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
        log.error("planner.calculate.failed", return_code=return_code, tail=tail)
        yield PlannerErrorEvent(
            message=f"Constellation scorer failed (exit {return_code}): {tail}"
        )
        return

    runtime = time.monotonic() - started
    try:
        results = _parse_csv(output_path, runtime)
    except PlannerError as exc:
        log.exception("planner.calculate.parse_failed")
        yield PlannerErrorEvent(message=str(exc))
        return

    _latest_by_period[req.period] = results
    log.info("planner.calculate.done", runtime_s=round(runtime, 2), rows=len(results.rows))

    yield PlannerProgress(percent=100.0, status_index=NUM_STEPS - 1, status=STATUS_LABELS[-1])
    yield PlannerDone(result_id=str(uuid.uuid4()))


def _line_to_progress(line: str) -> PlannerProgress | None:
    """Translate a single stderr line from the script into a progress event.

    The script emits ``[1/5]`` … ``[5/5]`` step markers as discrete \\n-terminated
    lines. Inner per-month progress within step 3 uses \\r and arrives buffered as
    one giant line after step 3 completes — we ignore the inner detail and just
    surface the 5 main steps.
    """
    m_step = _STEP_RE.search(line)
    if m_step is not None:
        step = int(m_step.group(1))
        if 1 <= step <= NUM_STEPS:
            # Show progress at the *end* of the active step so the bar advances
            # as soon as the step starts rather than dipping back to 0%.
            pct = step / NUM_STEPS * _FINAL_PROGRESS_PCT
            return PlannerProgress(
                percent=pct,
                status_index=step - 1,
                status=STATUS_LABELS[step - 1],
            )
    return None


def _parse_csv(path: Path, runtime_s: float) -> PlannerResults:
    """Parse the script's two-section CSV into a ``PlannerResults`` payload.

    Format (see constellation_scorer.export_csv):
        sep=,
        Constellation, <month1>, …, <monthN>, Best Month, Total[, Circumpolar]
        <name>, <s1>, …, <sN>, <best>, <total>[, true|false]
        ...
        <blank row>
        # Pivot Timestamps
        <ignored>

    The trailing ``Circumpolar`` column is optional for backward compatibility
    with older script outputs; when missing, every row defaults to ``False``
    and ``best_non_circumpolar`` falls back to ``best_constellation``.
    """
    if not path.is_file():
        raise PlannerError(f"Constellation scorer did not produce CSV at {path}")

    with path.open("r", encoding="utf-8-sig", newline="") as fh:
        reader = csv.reader(fh)
        rows = list(reader)

    if rows and rows[0] and rows[0][0].startswith("sep="):
        rows = rows[1:]

    if not rows:
        raise PlannerError("Constellation scorer CSV is empty")

    header = rows[0]
    if len(header) < 4 or header[0] != "Constellation":
        raise PlannerError(f"Unexpected CSV header: {header}")

    has_circumpolar = header[-1].strip().lower() == "circumpolar"
    fixed_trailing_cols = 3 if has_circumpolar else 2  # Best Month, Total[, Circumpolar]
    month_labels = header[1:-fixed_trailing_cols]
    n_months = len(month_labels)

    data_rows: list[PlannerRow] = []
    for raw in rows[1:]:
        if not raw or not raw[0]:
            break
        if raw[0].startswith("#"):
            break
        if len(raw) < n_months + 1 + fixed_trailing_cols:
            continue
        try:
            months = [float(cell or 0.0) for cell in raw[1 : 1 + n_months]]
            best = raw[1 + n_months]
            total = float(raw[2 + n_months] or 0.0)
        except ValueError:
            continue
        circumpolar = (
            raw[3 + n_months].strip().lower() == "true" if has_circumpolar else False
        )
        data_rows.append(
            PlannerRow(
                name=raw[0],
                months=months,
                best=best,
                total=total,
                circumpolar=circumpolar,
            )
        )

    if not data_rows:
        raise PlannerError("No data rows parsed from constellation scorer CSV")

    top = max(data_rows, key=lambda r: r.total)
    non_circumpolar_rows = [r for r in data_rows if not r.circumpolar]
    top_non_circumpolar = (
        max(non_circumpolar_rows, key=lambda r: r.total) if non_circumpolar_rows else None
    )
    average = round(sum(r.total for r in data_rows) / len(data_rows)) if data_rows else 0

    return PlannerResults(
        rows=data_rows,
        months=month_labels,
        kpis=PlannerKpis(
            best_constellation=PlannerBest(name=top.name, total=top.total),
            best_non_circumpolar=(
                PlannerBest(name=top_non_circumpolar.name, total=top_non_circumpolar.total)
                if top_non_circumpolar is not None
                else None
            ),
            peak_month=top.best,
            average_per_target_h=average,
            engine_runtime_s=round(runtime_s, 2),
        ),
    )

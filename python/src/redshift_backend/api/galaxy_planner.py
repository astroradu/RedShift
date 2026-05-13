from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from redshift_backend.api.sse import encode_sse
from redshift_backend.data import location as location_store
from redshift_backend.schemas.galaxy_planner import (
    GalaxyPlannerCalculateRequest,
    GalaxyPlannerDone,
    GalaxyPlannerErrorEvent,
    GalaxyPlannerProgress,
    GalaxyResults,
)
from redshift_backend.services.galaxy_planner_service import (
    PERIOD_TO_WINDOW,
    calculate,
    get_latest,
)

router = APIRouter(prefix="/galaxy-planner", tags=["galaxy-planner"])


@router.post("/calculate")
async def galaxy_planner_calculate(req: GalaxyPlannerCalculateRequest) -> StreamingResponse:
    location, source = location_store.get_current()
    if location is None or source == "none":
        raise HTTPException(
            status_code=400,
            detail=(
                "No location set. Please configure your location in Settings "
                "before running the galaxy planner."
            ),
        )
    if req.period not in PERIOD_TO_WINDOW:
        raise HTTPException(status_code=400, detail=f"Unsupported period: {req.period}")

    stream = encode_sse(
        calculate(req, location),
        progress_type=GalaxyPlannerProgress,
        done_type=GalaxyPlannerDone,
        error_type=GalaxyPlannerErrorEvent,
    )
    return StreamingResponse(stream, media_type="text/event-stream")


@router.get("/results", response_model=GalaxyResults)
async def galaxy_planner_results(
    period: str = "3 Months",
    compute_nonstandard: bool = False,
    min_angular_size: float = 0.0,
) -> GalaxyResults:
    results = get_latest(period, compute_nonstandard, min_angular_size)
    if results is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No galaxy planner results available for period {period!r} "
                f"(compute_nonstandard={compute_nonstandard}, "
                f"min_angular_size={min_angular_size}). Run a calculation first."
            ),
        )
    return results

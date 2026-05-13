from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from redshift_backend.api.sse import encode_sse
from redshift_backend.data import location as location_store
from redshift_backend.schemas.planner import (
    PlannerCalculateRequest,
    PlannerDone,
    PlannerErrorEvent,
    PlannerProgress,
    PlannerResults,
)
from redshift_backend.services.planner_service import (
    PERIOD_TO_WINDOW,
    calculate,
    get_latest,
)

router = APIRouter(prefix="/planner", tags=["planner"])


@router.post("/calculate")
async def planner_calculate(req: PlannerCalculateRequest) -> StreamingResponse:
    location, source = location_store.get_current()
    if location is None or source == "none":
        raise HTTPException(
            status_code=400,
            detail=(
                "No location set. Please configure your location in Settings "
                "before running the planner."
            ),
        )
    if req.period not in PERIOD_TO_WINDOW:
        raise HTTPException(status_code=400, detail=f"Unsupported period: {req.period}")

    stream = encode_sse(
        calculate(req, location),
        progress_type=PlannerProgress,
        done_type=PlannerDone,
        error_type=PlannerErrorEvent,
    )
    return StreamingResponse(stream, media_type="text/event-stream")


@router.get("/results", response_model=PlannerResults)
async def planner_results(period: str = "3 Months") -> PlannerResults:
    results = get_latest(period)
    if results is None:
        raise HTTPException(
            status_code=404,
            detail=f"No planner results available for period {period!r}. Run a calculation first.",
        )
    return results

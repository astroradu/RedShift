from fastapi import APIRouter

from redshift_backend.data import location as store
from redshift_backend.schemas.location import (
    Location,
    LocationResponse,
    LocationSaveRequest,
)

router = APIRouter(prefix="/location", tags=["location"])


@router.get("", response_model=LocationResponse)
async def get_location() -> LocationResponse:
    location, source = store.get_current()
    return LocationResponse(location=location, source=source)


@router.post("", response_model=LocationResponse)
async def save_location(req: LocationSaveRequest) -> LocationResponse:
    location = Location(lat=req.lat, lng=req.lng)
    store.set_current(location, req.source)
    return LocationResponse(location=location, source=req.source)

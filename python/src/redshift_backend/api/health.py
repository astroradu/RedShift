from fastapi import APIRouter
from pydantic import BaseModel

from redshift_backend import __version__

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    ok: bool
    version: str


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(ok=True, version=__version__)

from fastapi import APIRouter, Depends

from redshift_backend.api import (
    features,
    galaxy_planner,
    health,
    location,
    palettes,
    planner,
    settings,
    sky_viewer,
    tools,
)
from redshift_backend.core.security import require_token

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)

protected_router = APIRouter(prefix="/api", dependencies=[Depends(require_token)])
protected_router.include_router(features.router)
protected_router.include_router(tools.router)
protected_router.include_router(palettes.router)
protected_router.include_router(planner.router)
protected_router.include_router(galaxy_planner.router)
protected_router.include_router(location.router)
protected_router.include_router(settings.router)
protected_router.include_router(sky_viewer.router)

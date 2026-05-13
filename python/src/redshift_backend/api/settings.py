from fastapi import APIRouter

from redshift_backend.data import settings as store
from redshift_backend.schemas.settings import AppSettings, AppSettingsUpdate

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=AppSettings)
async def get_settings() -> AppSettings:
    return store.get_current()


@router.patch("", response_model=AppSettings)
async def update_settings(req: AppSettingsUpdate) -> AppSettings:
    return store.update(req)

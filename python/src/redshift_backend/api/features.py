from fastapi import APIRouter

from redshift_backend.data.features import FEATURES
from redshift_backend.schemas.feature import Feature

router = APIRouter(tags=["features"])


@router.get("/features", response_model=list[Feature])
async def list_features() -> list[Feature]:
    return FEATURES

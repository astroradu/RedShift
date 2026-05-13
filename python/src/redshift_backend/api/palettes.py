from fastapi import APIRouter

from redshift_backend.data.palettes import PALETTES
from redshift_backend.schemas.palette import Palette

router = APIRouter(tags=["palettes"])


@router.get("/palettes", response_model=list[Palette])
async def list_palettes() -> list[Palette]:
    return PALETTES

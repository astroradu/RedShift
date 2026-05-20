"""Sky Viewer endpoints — serves the HYG star catalogue, constellation lines,
and galaxy list to the frontend. See spec §7.

The /stars handler branches on the ``subset`` query param: ``subset=notable``
returns a JSON list of identifiable bright stars; otherwise it returns the
packed binary blob (optionally sliced by ``limit``).
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse, Response

from redshift_backend.data import sky_viewer as store
from redshift_backend.schemas.sky_viewer import (
    Constellation,
    Galaxy,
    StarCatalogueMeta,
)

router = APIRouter(prefix="/sky-viewer", tags=["sky-viewer"])


@router.get("/stars/meta", response_model=StarCatalogueMeta)
async def stars_meta() -> StarCatalogueMeta:
    """Describe the packed binary blob the frontend will fetch from /stars.

    Cheap and side-effect free *after* the first /stars call; the first call
    here triggers the lazy load via ``get_stars_meta()``.
    """
    return store.get_stars_meta()


@router.get("/stars")
async def stars(
    limit: int | None = Query(default=None, ge=0),
    subset: Literal["notable"] | None = Query(default=None),
) -> Response:
    """Dual-mode endpoint.

    * ``subset=notable``: returns a JSON list of ``NotableStar`` rows (mag<=5)
      with identifying metadata for hover/click popups.
    * default: returns the full HYG catalogue as a packed little-endian
      float32 buffer of shape ``(count, 5)``. Pass ``?limit=N`` to slice to
      the N brightest stars (the buffer is sorted by ascending magnitude).
    """
    if subset == "notable":
        # FastAPI's response_model machinery doesn't understand a union of
        # "list[NotableStar] OR raw bytes" cleanly, so we serialise here and
        # return a JSONResponse directly. The Pydantic models still validated
        # the data at construction time inside the store.
        rows = [s.model_dump() for s in store.get_notable_stars()]
        return JSONResponse(content=rows)

    buf = store.get_stars_buffer(limit=limit)
    return Response(content=buf, media_type="application/octet-stream")


@router.get("/constellations", response_model=list[Constellation])
async def constellations() -> list[Constellation]:
    """The 88 IAU constellations with star positions and line segments."""
    return store.get_constellations()


@router.get("/galaxies", response_model=list[Galaxy])
async def galaxies() -> list[Galaxy]:
    """Deep-sky galaxies rendered as ellipses on the dome.

    V1 returns a single hard-coded entry (Andromeda); the shape supports the
    full PGC catalogue in v2.
    """
    return store.get_galaxies()

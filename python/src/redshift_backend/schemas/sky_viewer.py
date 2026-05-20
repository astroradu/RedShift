from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict


class StarCatalogueMeta(BaseModel):
    """Shape of GET /api/sky-viewer/stars/meta — describes the binary blob."""

    model_config = ConfigDict(frozen=True)

    count: int
    field_count: int
    field_names: list[str]
    dtype: Literal["float32"]
    endianness: Literal["little"]


class NotableStar(BaseModel):
    """A subset of the HYG catalogue rich enough to render in a detail popup.

    Returned by GET /api/sky-viewer/stars?subset=notable. Frontend uses these
    for CPU-side projection + hover/click hit-testing — see spec §10.
    """

    id: int
    name: str  # best display name (proper_name | bayer_flamsteed | f"HD {hd}")
    hd: int | None
    hr: int | None
    gliese: str | None
    bayer_flamsteed: str | None
    proper_name: str | None
    ra_rad: float
    dec_rad: float
    mag: float
    abs_mag: float | None
    spectrum: str | None
    color_index: float | None
    distance_ly: float | None


class Galaxy(BaseModel):
    """A deep-sky object rendered as an ellipse on the dome.

    Backed by the top-100-by-angular-size slice of PGC. `angle_deg` defaults
    to 0 for catalogue rows because PGC doesn't carry a position angle column;
    callers that need it can plug a value in for individually-curated entries.
    """

    id: str
    name: str
    alt_names: list[str]
    ra_deg: float
    dec_deg: float
    major_arcmin: float
    minor_arcmin: float
    angle_deg: float
    tint: Literal["warm", "cool"]
    mag: float | None
    distance_mly: float | None


class ConstellationStar(BaseModel):
    id: int
    # `bfID` mirrors the field name in python_scripts/assets/constellations_data.json
    # (Bayer/Flamsteed designation, e.g. "21Alp And"). Keeping the exact casing
    # avoids a translation layer between the JSON source and the API contract.
    bfID: str  # noqa: N815 — preserve source-data field name
    ra_h: float
    dec_d: float


class Constellation(BaseModel):
    name: str
    center_ra_h: float
    center_dec_d: float
    stars: list[ConstellationStar]
    lines: list[tuple[int, int]]

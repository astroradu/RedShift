from pydantic import BaseModel, Field


class GalaxyRow(BaseModel):
    """One scored galaxy row from the planner CSV.

    ``metadata`` mirrors the metadata-tail columns of the source PGC CSV in
    declaration order so the frontend can render arbitrary fields without
    re-fetching the catalogue. Cell values are kept as strings — they are
    written verbatim by the script and may be empty.
    """

    pgc: str
    months: list[float]
    best: str
    total: float
    metadata: dict[str, str]


class GalaxyResults(BaseModel):
    rows: list[GalaxyRow]
    months: list[str]
    metadata_columns: list[str]
    total_rows: int
    engine_runtime_s: float


class GalaxyPlannerCalculateRequest(BaseModel):
    period: str
    month_precision: int = Field(default=5, ge=1, le=15)
    night_precision: int = Field(default=3, ge=1, le=15)
    compute_nonstandard: bool = False
    min_angular_size: float = Field(default=0.0, ge=0.0)


class GalaxyPlannerProgress(BaseModel):
    percent: float
    status_index: int
    status: str


class GalaxyPlannerDone(BaseModel):
    result_id: str


class GalaxyPlannerErrorEvent(BaseModel):
    message: str

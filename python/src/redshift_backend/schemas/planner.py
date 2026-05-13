from pydantic import BaseModel, Field


class PlannerRow(BaseModel):
    name: str
    months: list[float]
    best: str
    total: float
    circumpolar: bool = False


class PlannerKpis(BaseModel):
    best_constellation: "PlannerBest"
    best_non_circumpolar: "PlannerBest | None" = None
    peak_month: str
    average_per_target_h: int
    engine_runtime_s: float


class PlannerBest(BaseModel):
    name: str
    total: float


class PlannerResults(BaseModel):
    rows: list[PlannerRow]
    months: list[str]
    kpis: PlannerKpis


class PlannerCalculateRequest(BaseModel):
    period: str
    month_precision: int = Field(default=3, ge=1, le=10)
    night_precision: int = Field(default=3, ge=1, le=10)


class PlannerProgress(BaseModel):
    percent: float
    status_index: int
    status: str


class PlannerDone(BaseModel):
    result_id: str


class PlannerErrorEvent(BaseModel):
    message: str


PlannerKpis.model_rebuild()

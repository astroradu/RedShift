from typing import Literal

from pydantic import BaseModel, Field

Mode = Literal["dark", "light"]

_PALETTE_PATTERN = r"^[a-z][a-z0-9_-]*$"


class AppSettings(BaseModel):
    mode: Mode = "dark"
    palette: str = Field(default="ember", min_length=1, max_length=64, pattern=_PALETTE_PATTERN)


class AppSettingsUpdate(BaseModel):
    mode: Mode | None = None
    palette: str | None = Field(default=None, min_length=1, max_length=64, pattern=_PALETTE_PATTERN)

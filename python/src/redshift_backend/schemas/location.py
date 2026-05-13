from typing import Literal

from pydantic import BaseModel, Field

LocationSource = Literal["system", "manual", "none"]


class Location(BaseModel):
    lat: float = Field(ge=-90.0, le=90.0)
    lng: float = Field(ge=-180.0, le=180.0)


class LocationResponse(BaseModel):
    location: Location | None
    source: LocationSource


class LocationSaveRequest(BaseModel):
    lat: float = Field(ge=-90.0, le=90.0)
    lng: float = Field(ge=-180.0, le=180.0)
    source: Literal["system", "manual"] = "manual"

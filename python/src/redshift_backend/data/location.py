from __future__ import annotations

from typing import Any

import structlog
from pydantic import ValidationError

from redshift_backend.core.persistence import get_manager
from redshift_backend.schemas.location import Location, LocationSource

log = structlog.get_logger(__name__)

_NAMESPACE = "location"
_SCHEMA_VERSION = 1

_location: Location | None = None
_source: LocationSource = "none"
_loaded: bool = False


def get_current() -> tuple[Location | None, LocationSource]:
    _ensure_loaded()
    return _location, _source


def set_current(location: Location, source: LocationSource) -> None:
    global _location, _source, _loaded
    _location = location
    _source = source
    _loaded = True
    _persist()


def clear() -> None:
    global _location, _source, _loaded
    _location = None
    _source = "none"
    _loaded = True
    get_manager().delete(_NAMESPACE)


def _ensure_loaded() -> None:
    global _location, _source, _loaded
    if _loaded:
        return
    _loaded = True
    raw = get_manager().load(_NAMESPACE)
    if raw is None:
        return
    loc_raw = raw.get("location")
    src_raw = raw.get("source", "none")
    if loc_raw is None:
        _location = None
        _source = "none"
        return
    try:
        _location = Location(**loc_raw)
    except (TypeError, ValidationError) as e:
        log.warning("location.persisted_invalid", error=str(e))
        _location = None
        _source = "none"
        return
    _source = src_raw if src_raw in ("system", "manual") else "manual"


def _persist() -> None:
    payload: dict[str, Any] = {
        "version": _SCHEMA_VERSION,
        "location": _location.model_dump() if _location is not None else None,
        "source": _source,
    }
    try:
        get_manager().save(_NAMESPACE, payload)
    except OSError as e:
        log.warning("location.persist_failed", error=str(e))

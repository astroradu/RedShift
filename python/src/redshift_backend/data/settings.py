from __future__ import annotations

from typing import Any

import structlog
from pydantic import ValidationError

from redshift_backend.core.persistence import get_manager
from redshift_backend.schemas.settings import AppSettings, AppSettingsUpdate

log = structlog.get_logger(__name__)

_NAMESPACE = "settings"
_SCHEMA_VERSION = 1

DEFAULTS = AppSettings()

_settings: AppSettings | None = None
_loaded: bool = False


def get_current() -> AppSettings:
    _ensure_loaded()
    return _settings if _settings is not None else DEFAULTS


def update(partial: AppSettingsUpdate) -> AppSettings:
    global _settings, _loaded
    current = get_current()
    merged = current.model_copy(
        update={k: v for k, v in partial.model_dump(exclude_unset=True).items() if v is not None}
    )
    _settings = merged
    _loaded = True
    _persist()
    return merged


def clear() -> None:
    global _settings, _loaded
    _settings = None
    _loaded = True
    get_manager().delete(_NAMESPACE)


def _ensure_loaded() -> None:
    global _settings, _loaded
    if _loaded:
        return
    _loaded = True
    raw = get_manager().load(_NAMESPACE)
    if raw is None:
        return
    raw.pop("version", None)
    try:
        _settings = AppSettings(**raw)
    except (TypeError, ValidationError) as e:
        # Bad file (manual edit, schema drift) → fall back to defaults.
        log.warning("settings.persisted_invalid", error=str(e))
        _settings = None


def _persist() -> None:
    payload: dict[str, Any] = {
        "version": _SCHEMA_VERSION,
        **(_settings.model_dump() if _settings is not None else DEFAULTS.model_dump()),
    }
    try:
        get_manager().save(_NAMESPACE, payload)
    except OSError as e:
        log.warning("settings.persist_failed", error=str(e))

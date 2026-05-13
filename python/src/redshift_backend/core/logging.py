import logging
import sys
from logging.handlers import RotatingFileHandler

import structlog

from redshift_backend.core.config import Settings
from redshift_backend.core.paths import app_log_dir

_LOG_FILE_NAME = "redshift-backend.log"
_MAX_BYTES = 5 * 1024 * 1024
_BACKUP_COUNT = 5


def configure_logging(settings: Settings) -> None:
    log_path = app_log_dir() / _LOG_FILE_NAME
    file_handler = RotatingFileHandler(
        log_path, maxBytes=_MAX_BYTES, backupCount=_BACKUP_COUNT, encoding="utf-8"
    )
    file_handler.setFormatter(logging.Formatter("%(message)s"))

    handlers: list[logging.Handler] = [file_handler]
    if settings.dev_mode:
        stderr_handler = logging.StreamHandler(sys.stderr)
        stderr_handler.setFormatter(logging.Formatter("%(message)s"))
        handlers.append(stderr_handler)

    logging.basicConfig(
        level=settings.log_level,
        format="%(message)s",
        handlers=handlers,
        force=True,
    )

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, settings.log_level.upper(), logging.INFO)
        ),
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

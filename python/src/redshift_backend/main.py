from __future__ import annotations

import asyncio
import contextlib
import json
import signal
import socket
import sys
from collections.abc import Callable
from typing import Any

import structlog
import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from redshift_backend.api import api_router, protected_router
from redshift_backend.core.config import Settings
from redshift_backend.core.logging import configure_logging
from redshift_backend.core.security import TOKEN
from redshift_backend.data import location as location_store
from redshift_backend.schemas.location import Location

log = structlog.get_logger(__name__)

_READY_PREFIX = "REDSHIFT_READY "
_TAURI_ORIGINS = [
    "tauri://localhost",
    "https://tauri.localhost",
    "http://tauri.localhost",
]
# 1 MiB is well above any legitimate request the frontend issues (the largest
# is a location PATCH at a few hundred bytes). Anything over this is rejected
# at the ASGI boundary so we never allocate the body into memory.
_MAX_BODY_BYTES = 1 * 1024 * 1024


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        super().__init__(app)
        self._max_bytes = max_bytes

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        content_length = request.headers.get("content-length")
        if content_length is not None:
            try:
                if int(content_length) > self._max_bytes:
                    return JSONResponse(
                        {"detail": "Request body too large"},
                        status_code=413,
                    )
            except ValueError:
                return JSONResponse(
                    {"detail": "Invalid Content-Length"},
                    status_code=400,
                )
        return await call_next(request)


def create_app() -> FastAPI:
    app = FastAPI(title="RedShift", docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=_MAX_BODY_BYTES)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_TAURI_ORIGINS,
        allow_origin_regex=r"^http://localhost:\d+$",
        allow_methods=["GET", "POST", "PATCH"],
        allow_headers=["Authorization", "Content-Type", "Accept"],
        allow_credentials=False,
    )
    app.include_router(api_router)
    app.include_router(protected_router)
    return app


def _bind_socket(host: str, port: int) -> socket.socket:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind((host, port))
    sock.set_inheritable(True)
    return sock


def _announce_ready(port: int) -> None:
    payload = json.dumps({"port": port, "token": TOKEN}, separators=(",", ":"))
    sys.stdout.write(f"{_READY_PREFIX}{payload}\n")
    sys.stdout.flush()


def _install_signal_handlers(stopper: Callable[[], None]) -> None:
    def _handler(_signum: int, _frame: Any) -> None:
        stopper()

    for sig in (signal.SIGTERM, signal.SIGINT):
        with contextlib.suppress(ValueError, OSError):
            signal.signal(sig, _handler)


async def _serve(settings: Settings) -> None:
    sock = _bind_socket(settings.host, settings.port)
    bound_port = sock.getsockname()[1]

    app = create_app()
    config = uvicorn.Config(
        app,
        host=settings.host,
        port=bound_port,
        log_config=None,
        access_log=False,
        lifespan="on",
    )
    server = uvicorn.Server(config)

    def _stop() -> None:
        server.should_exit = True

    _install_signal_handlers(_stop)

    serve_task: asyncio.Task[None] = asyncio.create_task(server.serve(sockets=[sock]))

    while not server.started and not serve_task.done():
        await asyncio.sleep(0.01)

    if serve_task.done():
        await serve_task
        return

    _announce_ready(bound_port)
    log.info("backend.ready", port=bound_port, dev_mode=settings.dev_mode)

    try:
        await serve_task
    finally:
        log.info("backend.shutdown")


def _seed_dev_location() -> None:
    # Dev convenience: pre-populate the in-memory location so the planner doesn't
    # need a manual save on every cold start. Skipped in frozen (PyInstaller)
    # builds and when something else has already set the location.
    current, source = location_store.get_current()
    if current is not None or source != "none":
        return
    location_store.set_current(Location(lat=44.42, lng=26.10), "manual")
    log.info("backend.dev_location_seeded", lat=44.42, lng=26.10)


def main() -> None:
    settings = Settings()
    configure_logging(settings)
    if settings.dev_mode:
        _seed_dev_location()
    asyncio.run(_serve(settings))


__all__ = ["create_app", "main"]

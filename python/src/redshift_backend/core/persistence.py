from __future__ import annotations

import contextlib
import json
import os
import re
import tempfile
import threading
from pathlib import Path
from typing import Any

import structlog

from redshift_backend.core.paths import app_data_dir

log = structlog.get_logger(__name__)

_NAMESPACE_RE = re.compile(r"^[a-z][a-z0-9_]*$")
_FILE_SUFFIX = ".json"


class PersistenceManager:
    """JSON-on-disk persistence for backend state.

    Each namespace maps to one file under the base directory. Writes are
    atomic (temp file in the same directory, then ``os.replace``) so a crash
    mid-write cannot leave a half-written file. Per-namespace locks make
    concurrent saves to the same file safe; loads share that lock.

    The base directory is created on construction and on every save so a
    user wiping ``~/Library/Application Support/RedShift/`` does not break
    the running app.
    """

    def __init__(self, base_dir: Path) -> None:
        self._base_dir = base_dir
        self._base_dir.mkdir(parents=True, exist_ok=True)
        self._locks: dict[str, threading.Lock] = {}
        self._locks_guard = threading.Lock()

    @property
    def base_dir(self) -> Path:
        return self._base_dir

    def load(self, namespace: str) -> dict[str, Any] | None:
        """Return the JSON object stored at ``namespace``, or None if absent / corrupt."""
        path = self._path_for(namespace)
        with self._lock_for(namespace):
            try:
                raw = path.read_text(encoding="utf-8")
            except FileNotFoundError:
                return None
            except OSError as e:
                log.warning("persistence.load_failed", namespace=namespace, error=str(e))
                return None
            try:
                data = json.loads(raw)
            except json.JSONDecodeError as e:
                # Don't crash on a bad file — fall back to defaults.
                log.warning(
                    "persistence.corrupt_file",
                    namespace=namespace,
                    error=str(e),
                    path=str(path),
                )
                return None
            if not isinstance(data, dict):
                log.warning(
                    "persistence.unexpected_root",
                    namespace=namespace,
                    type=type(data).__name__,
                )
                return None
            return data

    def save(self, namespace: str, payload: dict[str, Any]) -> None:
        """Atomically write ``payload`` to ``namespace``."""
        path = self._path_for(namespace)
        with self._lock_for(namespace):
            self._base_dir.mkdir(parents=True, exist_ok=True)
            fd, tmp_path_str = tempfile.mkstemp(
                prefix=f".{namespace}.",
                suffix=".tmp",
                dir=str(self._base_dir),
            )
            tmp_path = Path(tmp_path_str)
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as f:
                    json.dump(payload, f, indent=2, sort_keys=True)
                    f.flush()
                    os.fsync(f.fileno())
                os.replace(tmp_path, path)
            except Exception:
                with contextlib.suppress(OSError):
                    tmp_path.unlink()
                raise
            else:
                log.debug("persistence.saved", namespace=namespace)

    def delete(self, namespace: str) -> None:
        path = self._path_for(namespace)
        with self._lock_for(namespace), contextlib.suppress(FileNotFoundError):
            path.unlink()

    def _path_for(self, namespace: str) -> Path:
        if not _NAMESPACE_RE.match(namespace):
            raise ValueError(f"Invalid persistence namespace: {namespace!r}")
        return self._base_dir / f"{namespace}{_FILE_SUFFIX}"

    def _lock_for(self, namespace: str) -> threading.Lock:
        with self._locks_guard:
            lock = self._locks.get(namespace)
            if lock is None:
                lock = threading.Lock()
                self._locks[namespace] = lock
            return lock


_manager: PersistenceManager | None = None
_manager_guard = threading.Lock()


def get_manager() -> PersistenceManager:
    """Return the process-wide PersistenceManager, creating it on first access.

    In dev and in the bundled app this points at ``platformdirs.user_data_dir``
    (e.g. ``~/Library/Application Support/RedShift/`` on macOS). Tests override
    it via :func:`set_manager`.
    """
    global _manager
    if _manager is not None:
        return _manager
    with _manager_guard:
        if _manager is None:
            _manager = PersistenceManager(app_data_dir())
    return _manager


def set_manager(manager: PersistenceManager | None) -> None:
    """Override (or reset, with ``None``) the process-wide manager. Test-only."""
    global _manager
    with _manager_guard:
        _manager = manager

"""Sidecar entry point.

Two roles:

1. **Backend** — the default. Starts the FastAPI sidecar and prints the
   ``REDSHIFT_READY`` handshake. Invoked by Tauri at app launch.

2. **Script runner** — when the first positional argument is
   ``--run-script <name>``, dispatch to the standalone astronomy script of
   that name via ``runpy``. This is what ``planner_service`` and
   ``galaxy_planner_service`` use to spawn ``constellation_scorer.py`` and
   ``galaxy_scorer.py`` as subprocesses.

   Why it exists: in a PyInstaller --onefile bundle, ``sys.executable`` is
   the bundled binary, not Python. ``[sys.executable, "some_script.py"]``
   from the services would otherwise re-launch a second backend instance
   instead of executing the script. By self-dispatching on ``--run-script``,
   the same invocation works in both dev (where ``sys.executable`` is the
   venv Python) and prod (where it's the frozen binary).
"""

from __future__ import annotations

import runpy
import sys

from redshift_backend.core.paths import scripts_dir
from redshift_backend.main import main as backend_main

_KNOWN_SCRIPTS: dict[str, str] = {
    "constellation_scorer": "constellation_scorer.py",
    "galaxy_scorer": "galaxy_scorer.py",
}


def _run_script(name: str, script_args: list[str]) -> int:
    if name not in _KNOWN_SCRIPTS:
        print(f"Unknown script: {name}", file=sys.stderr)
        return 2
    script_path = scripts_dir() / _KNOWN_SCRIPTS[name]
    if not script_path.is_file():
        print(f"Script file not found: {script_path}", file=sys.stderr)
        return 2

    # Make the script directory importable so galaxy_scorer can do
    # `from constellation_scorer import ...` regardless of cwd.
    script_dir = str(script_path.parent)
    if script_dir not in sys.path:
        sys.path.insert(0, script_dir)

    # runpy.run_path sets __name__ == '__main__' and __file__ == script_path,
    # so the script behaves exactly as if invoked via `python <path> ...`.
    sys.argv = [str(script_path), *script_args]
    try:
        runpy.run_path(str(script_path), run_name="__main__")
        return 0
    except SystemExit as exc:
        code = exc.code
        if isinstance(code, int):
            return code
        return 0 if code is None else 1


def _maybe_run_script() -> int | None:
    argv = sys.argv[1:]
    if not argv or argv[0] != "--run-script":
        return None
    if len(argv) < 2:
        print("--run-script requires a script name", file=sys.stderr)
        return 2
    return _run_script(argv[1], argv[2:])


if __name__ == "__main__":
    exit_code = _maybe_run_script()
    if exit_code is not None:
        sys.exit(exit_code)
    backend_main()

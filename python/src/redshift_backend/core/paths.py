import sys
from pathlib import Path

from platformdirs import PlatformDirs

_dirs = PlatformDirs(appname="RedShift", appauthor=False, ensure_exists=True)


def app_log_dir() -> Path:
    return Path(_dirs.user_log_dir)


def app_data_dir() -> Path:
    return Path(_dirs.user_data_dir)


def scripts_dir() -> Path:
    """Return the directory holding the standalone astronomy scripts.

    When frozen by PyInstaller (--onefile), the build embeds ``python_scripts/``
    under ``sys._MEIPASS``. In a dev checkout we walk up from this file to the
    repo root and use the source-tree copy. The same scripts are loaded via
    ``runpy.run_path()`` in both modes, so ``__file__`` resolves to the
    correct directory and the scripts' internal ``sys.path`` tweaks (used by
    ``galaxy_scorer`` to import from ``constellation_scorer``) keep working.
    """
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass is not None:
        return Path(meipass) / "python_scripts"
    # This file lives at python/src/redshift_backend/core/paths.py — repo root
    # is four levels up.
    return Path(__file__).resolve().parents[4] / "python_scripts"


def script_dispatch_prefix() -> list[str]:
    """Argv prefix that routes through ``__main__.py``'s ``--run-script`` dispatcher.

    ``sys.executable`` points at different things in dev vs. frozen builds:
      - dev: venv python → ``[python, "-m", "redshift_backend"]``
      - frozen: bundled binary → ``[binary]`` (self-dispatches on --run-script)
    """
    if getattr(sys, "frozen", False):
        return [sys.executable]
    return [sys.executable, "-m", "redshift_backend"]

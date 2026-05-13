from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from redshift_backend.core.persistence import PersistenceManager, set_manager
from redshift_backend.core.security import TOKEN
from redshift_backend.data import location as location_store
from redshift_backend.data import settings as settings_store
from redshift_backend.main import create_app


@pytest.fixture(autouse=True)
def _isolated_persistence(tmp_path: Path) -> Iterator[Path]:
    """Redirect PersistenceManager to a fresh temp dir for every test.

    Also clears the module-level caches in data stores so each test gets a
    cold-start view of disk. Tests that simulate a restart can call
    ``_reset_data_caches()`` (returned via this fixture's helpers) after
    writing state, then re-read through the store APIs.
    """
    base = tmp_path / "redshift"
    set_manager(PersistenceManager(base))
    _reset_data_caches()
    yield base
    _reset_data_caches()
    set_manager(None)


def _reset_data_caches() -> None:
    location_store._location = None
    location_store._source = "none"
    location_store._loaded = False
    settings_store._settings = None
    settings_store._loaded = False


@pytest.fixture
def reset_data_caches():
    """Expose the in-memory cache reset to tests that simulate restarts."""
    return _reset_data_caches


@pytest.fixture
def token() -> str:
    return TOKEN


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

"""Tests for the Sky Viewer API router (spec §7).

Mirrors the project's async-test convention: ``asyncio_mode = "auto"`` in
``pyproject.toml`` means bare ``async def`` tests are auto-collected, and the
shared ``client``/``token`` fixtures come from ``conftest.py``.
"""

from __future__ import annotations

from httpx import AsyncClient


async def test_stars_meta_endpoint(client: AsyncClient, token: str) -> None:
    response = await client.get(
        "/api/sky-viewer/stars/meta",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    body = response.json()
    # Full HYG catalogue is ~87,476 rows; a lower bound of 80k is enough to
    # detect accidental truncation without being brittle if rows are added.
    assert body["count"] > 80_000
    assert body["field_names"] == ["ra_rad", "dec_rad", "mag", "color_index", "distance_ly"]
    assert body["dtype"] == "float32"
    assert body["endianness"] == "little"
    assert body["field_count"] == 5


async def test_stars_binary_endpoint_full(client: AsyncClient, token: str) -> None:
    headers = {"Authorization": f"Bearer {token}"}
    meta = (await client.get("/api/sky-viewer/stars/meta", headers=headers)).json()
    response = await client.get("/api/sky-viewer/stars", headers=headers)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/octet-stream"
    # 5 fields x 4 bytes (float32) per row.
    assert len(response.content) == meta["count"] * 5 * 4


async def test_stars_binary_endpoint_limit(client: AsyncClient, token: str) -> None:
    response = await client.get(
        "/api/sky-viewer/stars?limit=50",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/octet-stream"
    assert len(response.content) == 50 * 5 * 4


async def test_stars_notable_subset(client: AsyncClient, token: str) -> None:
    response = await client.get(
        "/api/sky-viewer/stars?subset=notable",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    rows = response.json()
    # mag <= 5.0 yields roughly ~1.6k entries in the HYG catalogue; allow a
    # generous band so dataset refreshes don't break the test.
    assert 1400 < len(rows) < 1900
    assert all(row["mag"] <= 5.0 for row in rows)


async def test_constellations_endpoint(client: AsyncClient, token: str) -> None:
    response = await client.get(
        "/api/sky-viewer/constellations",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 88  # the IAU canon
    assert all(len(row["lines"]) > 0 for row in rows)


async def test_galaxies_endpoint(client: AsyncClient, token: str) -> None:
    response = await client.get(
        "/api/sky-viewer/galaxies",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) > 1000
    andromeda = next((g for g in rows if g["id"] == "PGC2557"), None)
    assert andromeda is not None


async def test_endpoints_require_token(client: AsyncClient) -> None:
    for path in (
        "/api/sky-viewer/stars/meta",
        "/api/sky-viewer/stars",
        "/api/sky-viewer/stars?subset=notable",
        "/api/sky-viewer/constellations",
        "/api/sky-viewer/galaxies",
    ):
        response = await client.get(path)
        assert response.status_code == 401, f"{path} should require token"

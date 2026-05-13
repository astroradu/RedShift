from collections.abc import Callable

from httpx import AsyncClient


async def test_get_empty_returns_none(client: AsyncClient, token: str) -> None:
    response = await client.get("/api/location", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    body = response.json()
    assert body == {"location": None, "source": "none"}


async def test_save_valid_manual(client: AsyncClient, token: str) -> None:
    response = await client.post(
        "/api/location",
        headers={"Authorization": f"Bearer {token}"},
        json={"lat": 47.6062, "lng": -122.3321},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["location"] == {"lat": 47.6062, "lng": -122.3321}
    assert body["source"] == "manual"

    follow_up = await client.get("/api/location", headers={"Authorization": f"Bearer {token}"})
    assert follow_up.json() == body


async def test_save_system_source(client: AsyncClient, token: str) -> None:
    response = await client.post(
        "/api/location",
        headers={"Authorization": f"Bearer {token}"},
        json={"lat": 0.0, "lng": 0.0, "source": "system"},
    )
    assert response.status_code == 200
    assert response.json()["source"] == "system"


async def test_save_rejects_lat_out_of_range(client: AsyncClient, token: str) -> None:
    response = await client.post(
        "/api/location",
        headers={"Authorization": f"Bearer {token}"},
        json={"lat": 95.0, "lng": 0.0},
    )
    assert response.status_code == 422
    detail = response.json()["detail"][0]
    assert detail["loc"][-1] == "lat"


async def test_save_rejects_lng_out_of_range(client: AsyncClient, token: str) -> None:
    response = await client.post(
        "/api/location",
        headers={"Authorization": f"Bearer {token}"},
        json={"lat": 0.0, "lng": -200.0},
    )
    assert response.status_code == 422
    detail = response.json()["detail"][0]
    assert detail["loc"][-1] == "lng"


async def test_get_requires_auth(client: AsyncClient) -> None:
    response = await client.get("/api/location")
    assert response.status_code == 401


async def test_location_persists_across_restart(
    client: AsyncClient,
    token: str,
    reset_data_caches: Callable[[], None],
) -> None:
    await client.post(
        "/api/location",
        headers={"Authorization": f"Bearer {token}"},
        json={"lat": 47.6062, "lng": -122.3321},
    )

    # Simulate a cold start: drop the in-memory cache. The next GET must
    # re-hydrate from disk via the PersistenceManager.
    reset_data_caches()

    response = await client.get("/api/location", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    body = response.json()
    assert body == {"location": {"lat": 47.6062, "lng": -122.3321}, "source": "manual"}

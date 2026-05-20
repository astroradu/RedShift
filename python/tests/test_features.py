from httpx import AsyncClient


async def test_features_requires_token(client: AsyncClient) -> None:
    response = await client.get("/api/features")
    assert response.status_code == 401


async def test_features_returns_planner_and_sky(client: AsyncClient, token: str) -> None:
    response = await client.get("/api/features", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2

    planner = next((f for f in body if f["id"] == "planner"), None)
    assert planner is not None
    assert planner["num"] == "01"
    assert planner["name"] == "Imaging Planner"
    assert planner["meta"] == "EPHEMERIS"
    assert planner["toolbar"] is True

    sky = next((f for f in body if f["id"] == "sky"), None)
    assert sky is not None
    assert sky["num"] == "02"
    assert sky["name"] == "Sky Viewer"
    assert sky["meta"] == "CELESTIAL"
    assert sky["icon"] == "sky-viewer"
    assert sky["toolbar"] is False

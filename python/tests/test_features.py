from httpx import AsyncClient


async def test_features_requires_token(client: AsyncClient) -> None:
    response = await client.get("/api/features")
    assert response.status_code == 401


async def test_features_returns_planner_only(client: AsyncClient, token: str) -> None:
    response = await client.get("/api/features", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    only = body[0]
    assert only["id"] == "planner"
    assert only["num"] == "01"
    assert only["name"] == "Imaging Planner"
    assert only["meta"] == "EPHEMERIS"

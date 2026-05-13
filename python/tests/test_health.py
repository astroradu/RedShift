from httpx import AsyncClient


async def test_health_no_auth(client: AsyncClient) -> None:
    response = await client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert isinstance(body["version"], str)


async def test_health_ignores_bad_token(client: AsyncClient) -> None:
    response = await client.get("/api/health", headers={"Authorization": "Bearer wrong"})
    assert response.status_code == 200

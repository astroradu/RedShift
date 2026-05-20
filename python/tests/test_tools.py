from httpx import AsyncClient


async def test_tools_planner(client: AsyncClient, token: str) -> None:
    response = await client.get("/api/tools/planner", headers={"Authorization": f"Bearer {token}"})
    body = response.json()
    assert body["default_tool_id"] == "constellation"
    tool_ids = [t["id"] for t in body["tools"]]
    assert tool_ids == ["constellation", "galaxy"]


async def test_tools_sky(client: AsyncClient, token: str) -> None:
    response = await client.get("/api/tools/sky", headers={"Authorization": f"Bearer {token}"})
    body = response.json()
    assert body["default_tool_id"] == "sky-view"
    tool_ids = [t["id"] for t in body["tools"]]
    assert tool_ids == ["sky-view"]
    assert body["tools"][0]["label"] == "Sky View"
    assert body["tools"][0]["icon"] == "globe-grid"


async def test_tools_unknown_falls_back(client: AsyncClient, token: str) -> None:
    response = await client.get("/api/tools/unknown", headers={"Authorization": f"Bearer {token}"})
    body = response.json()
    assert body["tools"] == []

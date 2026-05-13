from httpx import AsyncClient


async def test_palettes_returns_seven(client: AsyncClient, token: str) -> None:
    response = await client.get("/api/palettes", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 7
    ids = [p["id"] for p in body]
    assert ids == ["aurora", "nebula", "mars", "ember", "verdant", "monochrome", "solar"]


async def test_palette_vars_dashed(client: AsyncClient, token: str) -> None:
    response = await client.get("/api/palettes", headers={"Authorization": f"Bearer {token}"})
    aurora = response.json()[0]
    assert aurora["dark"]["--bg"] == "#080B12"
    assert aurora["light"]["--bg"] == "#F0F4FF"
    assert aurora["dark"]["--star-opacity"] == "0.55"

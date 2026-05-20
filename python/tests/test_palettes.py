from httpx import AsyncClient


async def test_palettes_returns_eight(client: AsyncClient, token: str) -> None:
    response = await client.get("/api/palettes", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 8
    ids = [p["id"] for p in body]
    assert ids == ["ember", "regolith", "monochrome", "aurora", "nebula", "mars", "verdant", "solar"]


async def test_palette_vars_dashed(client: AsyncClient, token: str) -> None:
    response = await client.get("/api/palettes", headers={"Authorization": f"Bearer {token}"})
    # Aurora is now the 4th entry after the reorder (ember, regolith, monochrome, aurora, …)
    aurora = next(p for p in response.json() if p["id"] == "aurora")
    assert aurora["dark"]["--bg"] == "#080B12"
    assert aurora["light"]["--bg"] == "#F0F4FF"
    assert aurora["dark"]["--star-opacity"] == "0.55"

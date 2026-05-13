from collections.abc import Callable

from httpx import AsyncClient


async def test_get_returns_defaults(client: AsyncClient, token: str) -> None:
    response = await client.get("/api/settings", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json() == {"mode": "dark", "palette": "ember"}


async def test_patch_mode_only(client: AsyncClient, token: str) -> None:
    response = await client.patch(
        "/api/settings",
        headers={"Authorization": f"Bearer {token}"},
        json={"mode": "light"},
    )
    assert response.status_code == 200
    assert response.json() == {"mode": "light", "palette": "ember"}


async def test_patch_palette_only(client: AsyncClient, token: str) -> None:
    response = await client.patch(
        "/api/settings",
        headers={"Authorization": f"Bearer {token}"},
        json={"palette": "nebula"},
    )
    assert response.status_code == 200
    assert response.json() == {"mode": "dark", "palette": "nebula"}


async def test_patch_both(client: AsyncClient, token: str) -> None:
    response = await client.patch(
        "/api/settings",
        headers={"Authorization": f"Bearer {token}"},
        json={"mode": "light", "palette": "mars"},
    )
    assert response.status_code == 200
    assert response.json() == {"mode": "light", "palette": "mars"}


async def test_patch_invalid_mode_rejected(client: AsyncClient, token: str) -> None:
    response = await client.patch(
        "/api/settings",
        headers={"Authorization": f"Bearer {token}"},
        json={"mode": "sepia"},
    )
    assert response.status_code == 422


async def test_patch_invalid_palette_rejected(client: AsyncClient, token: str) -> None:
    response = await client.patch(
        "/api/settings",
        headers={"Authorization": f"Bearer {token}"},
        json={"palette": "Has Spaces!"},
    )
    assert response.status_code == 422


async def test_get_requires_auth(client: AsyncClient) -> None:
    response = await client.get("/api/settings")
    assert response.status_code == 401


async def test_settings_persist_across_restart(
    client: AsyncClient,
    token: str,
    reset_data_caches: Callable[[], None],
) -> None:
    await client.patch(
        "/api/settings",
        headers={"Authorization": f"Bearer {token}"},
        json={"mode": "light", "palette": "verdant"},
    )

    reset_data_caches()  # drop in-memory cache; next GET must hit disk.

    response = await client.get("/api/settings", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json() == {"mode": "light", "palette": "verdant"}


async def test_corrupt_settings_file_falls_back_to_defaults(
    client: AsyncClient,
    token: str,
    tmp_path: object,  # only here to ensure fixture ordering doesn't matter
    reset_data_caches: Callable[[], None],
) -> None:
    from redshift_backend.core.persistence import get_manager

    # Write a corrupt file directly through the manager's base dir.
    bad = get_manager().base_dir / "settings.json"
    bad.parent.mkdir(parents=True, exist_ok=True)
    bad.write_text("{ this is not json", encoding="utf-8")
    reset_data_caches()

    response = await client.get("/api/settings", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json() == {"mode": "dark", "palette": "ember"}

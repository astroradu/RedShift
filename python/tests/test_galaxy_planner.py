from pathlib import Path

import pytest
from httpx import AsyncClient

from redshift_backend.data import location as location_store
from redshift_backend.schemas.galaxy_planner import (
    GalaxyResults,
    GalaxyRow,
)
from redshift_backend.schemas.location import Location
from redshift_backend.services import galaxy_planner_service


@pytest.fixture(autouse=True)
def _reset_location() -> None:
    location_store.clear()
    galaxy_planner_service._latest_by_key.clear()
    yield
    location_store.clear()
    galaxy_planner_service._latest_by_key.clear()


async def test_calculate_without_location_returns_400(client: AsyncClient, token: str) -> None:
    response = await client.post(
        "/api/galaxy-planner/calculate",
        headers={"Authorization": f"Bearer {token}"},
        json={"period": "3 Months", "month_precision": 5, "night_precision": 3},
    )
    assert response.status_code == 400
    assert "location" in response.json()["detail"].lower()


async def test_calculate_with_unknown_period_returns_400(client: AsyncClient, token: str) -> None:
    location_store.set_current(Location(lat=45.0, lng=26.0), "manual")
    response = await client.post(
        "/api/galaxy-planner/calculate",
        headers={"Authorization": f"Bearer {token}"},
        json={"period": "99 Months", "month_precision": 5, "night_precision": 3},
    )
    assert response.status_code == 400


async def test_results_404_when_no_calculation(client: AsyncClient, token: str) -> None:
    response = await client.get(
        "/api/galaxy-planner/results?period=3+Months",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 404


async def test_results_returns_cached_after_calculation(client: AsyncClient, token: str) -> None:
    cached = GalaxyResults(
        rows=[
            GalaxyRow(
                pgc="60052",
                months=[100.0, 200.0, 150.0],
                best="February",
                total=450.0,
                metadata={"objname": "UGC10806", "ra_deg": "259.7"},
            )
        ],
        months=["Jan", "Feb", "Mar"],
        metadata_columns=["objname", "ra_deg"],
        total_rows=1,
        engine_runtime_s=1.23,
    )
    galaxy_planner_service._latest_by_key[("3 Months", False, 0.0)] = cached

    response = await client.get(
        "/api/galaxy-planner/results?period=3+Months&compute_nonstandard=false",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["rows"][0]["pgc"] == "60052"
    assert body["months"] == ["Jan", "Feb", "Mar"]
    assert body["metadata_columns"] == ["objname", "ra_deg"]
    assert body["total_rows"] == 1


async def test_results_keyed_by_compute_nonstandard(client: AsyncClient, token: str) -> None:
    """The same period stores separate results when compute_nonstandard differs."""
    g_only = GalaxyResults(
        rows=[GalaxyRow(pgc="1", months=[1.0], best="Jan", total=1.0, metadata={})],
        months=["Jan"], metadata_columns=[], total_rows=1, engine_runtime_s=0.1,
    )
    full = GalaxyResults(
        rows=[GalaxyRow(pgc="2", months=[2.0], best="Jan", total=2.0, metadata={})],
        months=["Jan"], metadata_columns=[], total_rows=1, engine_runtime_s=0.2,
    )
    galaxy_planner_service._latest_by_key[("3 Months", False, 0.0)] = g_only
    galaxy_planner_service._latest_by_key[("3 Months", True, 0.0)] = full

    r1 = await client.get(
        "/api/galaxy-planner/results?period=3+Months&compute_nonstandard=false",
        headers={"Authorization": f"Bearer {token}"},
    )
    r2 = await client.get(
        "/api/galaxy-planner/results?period=3+Months&compute_nonstandard=true",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r1.json()["rows"][0]["pgc"] == "1"
    assert r2.json()["rows"][0]["pgc"] == "2"


def test_parse_csv_extracts_rows_metadata_and_layout(tmp_path: Path) -> None:
    csv_path = tmp_path / "scores.csv"
    csv_path.write_text(
        "sep=,\r\n"
        "pgc,Jan,Feb,Mar,Best Month,Total,objtype,objname,ra_deg,dec_deg\r\n"
        "60052,100.0,200.0,150.0,February,450.0,G,UGC10806,259.71,49.88\r\n"
        "12345,50.0,80.0,60.0,February,190.0,G,NGC1234,12.34,-5.0\r\n"
        "\r\n"
        "# Pivot Timestamps\r\n"
        "Timestamp (UTC),Note\r\n"
        "2026.05.01 22:00,astronomical night start\r\n",
        encoding="utf-8-sig",
    )

    results = galaxy_planner_service._parse_csv(csv_path, runtime_s=1.5)

    assert results.months == ["Jan", "Feb", "Mar"]
    assert results.metadata_columns == ["objtype", "objname", "ra_deg", "dec_deg"]
    assert results.total_rows == 2
    assert results.engine_runtime_s == 1.5

    by_pgc = {r.pgc: r for r in results.rows}
    assert by_pgc["60052"].months == [100.0, 200.0, 150.0]
    assert by_pgc["60052"].best == "February"
    assert by_pgc["60052"].total == 450.0
    assert by_pgc["60052"].metadata == {
        "objtype": "G",
        "objname": "UGC10806",
        "ra_deg": "259.71",
        "dec_deg": "49.88",
    }


def test_parse_csv_pads_short_rows(tmp_path: Path) -> None:
    """Rows missing trailing metadata cells are padded with empty strings."""
    csv_path = tmp_path / "short.csv"
    csv_path.write_text(
        "sep=,\r\n"
        "pgc,Jan,Best Month,Total,objtype,objname\r\n"
        "1,5.0,January,5.0,G\r\n",  # missing objname
        encoding="utf-8-sig",
    )
    results = galaxy_planner_service._parse_csv(csv_path, runtime_s=0.1)
    assert results.rows[0].metadata == {"objtype": "G", "objname": ""}


def test_parse_csv_raises_on_bad_header(tmp_path: Path) -> None:
    csv_path = tmp_path / "bad.csv"
    csv_path.write_text("sep=,\r\nfoo,bar\r\n", encoding="utf-8-sig")
    with pytest.raises(galaxy_planner_service.GalaxyPlannerError):
        galaxy_planner_service._parse_csv(csv_path, runtime_s=0.0)


def test_parse_csv_raises_when_total_missing(tmp_path: Path) -> None:
    csv_path = tmp_path / "no_total.csv"
    csv_path.write_text(
        "sep=,\r\npgc,Jan,Best Month\r\n1,5.0,January\r\n",
        encoding="utf-8-sig",
    )
    with pytest.raises(galaxy_planner_service.GalaxyPlannerError):
        galaxy_planner_service._parse_csv(csv_path, runtime_s=0.0)


async def test_calculate_emits_error_event_when_period_unsupported_at_service_level() -> None:
    """Defense-in-depth: bypassing the route still surfaces a structured error event."""
    from redshift_backend.schemas.galaxy_planner import (
        GalaxyPlannerCalculateRequest,
        GalaxyPlannerErrorEvent,
    )

    location_store.set_current(Location(lat=45.0, lng=26.0), "manual")
    req = GalaxyPlannerCalculateRequest.model_construct(
        period="??", month_precision=5, night_precision=3, compute_nonstandard=False
    )
    events = []
    async for event in galaxy_planner_service.calculate(req, Location(lat=45.0, lng=26.0)):
        events.append(event)
    assert any(isinstance(e, GalaxyPlannerErrorEvent) for e in events)
    assert "Unsupported period" in next(
        e.message for e in events if isinstance(e, GalaxyPlannerErrorEvent)
    )


async def test_tools_endpoint_includes_galaxy_planner(client: AsyncClient, token: str) -> None:
    response = await client.get(
        "/api/tools/planner",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    body = response.json()
    tool_ids = [t["id"] for t in body["tools"]]
    assert "constellation" in tool_ids
    assert "galaxy" in tool_ids

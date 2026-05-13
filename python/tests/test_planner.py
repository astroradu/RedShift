from pathlib import Path

import pytest
from httpx import AsyncClient

from redshift_backend.data import location as location_store
from redshift_backend.schemas.location import Location
from redshift_backend.schemas.planner import (
    PlannerBest,
    PlannerKpis,
    PlannerResults,
    PlannerRow,
)
from redshift_backend.services import planner_service


@pytest.fixture(autouse=True)
def _reset_location() -> None:
    location_store.clear()
    yield
    location_store.clear()


async def test_calculate_without_location_returns_400(client: AsyncClient, token: str) -> None:
    response = await client.post(
        "/api/planner/calculate",
        headers={"Authorization": f"Bearer {token}"},
        json={"period": "3 Months", "month_precision": 3, "night_precision": 3},
    )
    assert response.status_code == 400
    assert "location" in response.json()["detail"].lower()


async def test_calculate_with_unknown_period_returns_400(client: AsyncClient, token: str) -> None:
    location_store.set_current(Location(lat=45.0, lng=26.0), "manual")
    response = await client.post(
        "/api/planner/calculate",
        headers={"Authorization": f"Bearer {token}"},
        json={"period": "99 Months", "month_precision": 3, "night_precision": 3},
    )
    assert response.status_code == 400


async def test_results_404_when_no_calculation(client: AsyncClient, token: str) -> None:
    response = await client.get(
        "/api/planner/results?period=3+Months",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 404


async def test_results_returns_cached_after_calculation(client: AsyncClient, token: str) -> None:
    cached = PlannerResults(
        rows=[
            PlannerRow(
                name="Lyra",
                months=[100.0, 200.0, 150.0],
                best="February",
                total=450.0,
                circumpolar=False,
            )
        ],
        months=["Jan", "Feb", "Mar"],
        kpis=PlannerKpis(
            best_constellation=PlannerBest(name="Lyra", total=450.0),
            best_non_circumpolar=PlannerBest(name="Lyra", total=450.0),
            peak_month="February",
            average_per_target_h=450,
            engine_runtime_s=1.23,
        ),
    )
    planner_service._latest_by_period["3 Months"] = cached
    try:
        response = await client.get(
            "/api/planner/results?period=3+Months",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["rows"][0]["name"] == "Lyra"
        assert body["kpis"]["best_constellation"]["name"] == "Lyra"
        assert body["months"] == ["Jan", "Feb", "Mar"]
    finally:
        planner_service._latest_by_period.clear()


def test_parse_csv_extracts_rows_and_top(tmp_path: Path) -> None:
    csv_path = tmp_path / "scores.csv"
    csv_path.write_text(
        "sep=,\r\n"
        "Constellation,Jan,Feb,Mar,Best Month,Total,Circumpolar\r\n"
        "Ursa Minor,40.0,42.0,41.0,February,123.0,true\r\n"
        "Lyra,10.5,20.0,15.5,February,46.0,false\r\n"
        "Cygnus,5.0,8.0,3.0,February,16.0,false\r\n"
        "\r\n"
        "# Pivot Timestamps\r\n"
        "Timestamp (UTC),Note\r\n"
        "2026.05.01 22:00,astronomical night start\r\n",
        encoding="utf-8-sig",
    )

    results = planner_service._parse_csv(csv_path, runtime_s=1.5)

    assert results.months == ["Jan", "Feb", "Mar"]
    assert len(results.rows) == 3
    assert results.kpis.best_constellation.name == "Ursa Minor"
    assert results.kpis.best_constellation.total == 123.0
    # Best non-circumpolar should be Lyra (Ursa Minor is circumpolar; Cygnus is lower).
    assert results.kpis.best_non_circumpolar is not None
    assert results.kpis.best_non_circumpolar.name == "Lyra"
    assert results.kpis.best_non_circumpolar.total == 46.0
    # Per-row flag preserved.
    by_name = {r.name: r for r in results.rows}
    assert by_name["Ursa Minor"].circumpolar is True
    assert by_name["Lyra"].circumpolar is False
    assert results.kpis.peak_month == "February"
    assert results.kpis.engine_runtime_s == 1.5


def test_parse_csv_without_circumpolar_column_falls_back(tmp_path: Path) -> None:
    """Older script outputs (no Circumpolar column) still parse — every row
    is treated as non-circumpolar so best_non_circumpolar mirrors the top row."""
    csv_path = tmp_path / "legacy.csv"
    csv_path.write_text(
        "sep=,\r\n"
        "Constellation,Jan,Feb,Mar,Best Month,Total\r\n"
        "Lyra,10.5,20.0,15.5,February,46.0\r\n"
        "Cygnus,5.0,8.0,3.0,February,16.0\r\n",
        encoding="utf-8-sig",
    )

    results = planner_service._parse_csv(csv_path, runtime_s=0.5)
    assert results.kpis.best_constellation.name == "Lyra"
    assert results.kpis.best_non_circumpolar is not None
    assert results.kpis.best_non_circumpolar.name == "Lyra"
    assert all(r.circumpolar is False for r in results.rows)


def test_parse_csv_all_circumpolar_yields_no_non_circumpolar(tmp_path: Path) -> None:
    """If every visible constellation is circumpolar (unlikely outside polar
    observers), best_non_circumpolar is None — the frontend hides the card."""
    csv_path = tmp_path / "all_circ.csv"
    csv_path.write_text(
        "sep=,\r\n"
        "Constellation,Jan,Best Month,Total,Circumpolar\r\n"
        "Ursa Minor,40.0,January,40.0,true\r\n"
        "Draco,38.0,January,38.0,true\r\n",
        encoding="utf-8-sig",
    )

    results = planner_service._parse_csv(csv_path, runtime_s=0.1)
    assert results.kpis.best_non_circumpolar is None


def test_parse_csv_raises_when_header_missing(tmp_path: Path) -> None:
    csv_path = tmp_path / "bad.csv"
    csv_path.write_text("sep=,\r\nfoo,bar\r\n", encoding="utf-8-sig")

    with pytest.raises(planner_service.PlannerError):
        planner_service._parse_csv(csv_path, runtime_s=0.0)


async def test_calculate_emits_error_event_when_period_unsupported_at_service_level() -> None:
    """Defense-in-depth: even if the route's pre-check were bypassed, the
    generator yields a structured error event rather than crashing."""
    from redshift_backend.schemas.planner import PlannerCalculateRequest, PlannerErrorEvent

    location_store.set_current(Location(lat=45.0, lng=26.0), "manual")
    req = PlannerCalculateRequest.model_construct(period="??", month_precision=3, night_precision=3)
    events = []
    async for event in planner_service.calculate(req, Location(lat=45.0, lng=26.0)):
        events.append(event)
    assert any(isinstance(e, PlannerErrorEvent) for e in events)
    assert "Unsupported period" in next(
        e.message for e in events if isinstance(e, PlannerErrorEvent)
    )

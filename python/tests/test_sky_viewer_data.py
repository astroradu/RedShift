import struct

from redshift_backend.data import sky_viewer as store


def _reset() -> None:
    """Force the next access to re-read from disk (simulates a cold start)."""
    store._stars_buffer = None
    store._notable_stars = None
    store._constellations = None
    store._galaxies = None


def test_get_stars_meta_returns_expected_shape() -> None:
    _reset()
    meta = store.get_stars_meta()
    assert meta.count > 80_000  # HYG has 87,476 — allow some row-drop tolerance
    assert meta.field_count == 5
    assert meta.field_names == ["ra_rad", "dec_rad", "mag", "color_index", "distance_ly"]
    assert meta.dtype == "float32"
    assert meta.endianness == "little"


def test_get_stars_buffer_is_sorted_by_magnitude() -> None:
    _reset()
    buf = store.get_stars_buffer(limit=20)
    rows = list(struct.iter_unpack("<5f", buf))
    mags = [r[2] for r in rows]
    assert mags == sorted(mags), "stars must be sorted by ascending magnitude"
    assert mags[0] < 0, "the brightest star (Sirius, mag -1.46) should be first"


def test_get_stars_buffer_respects_limit() -> None:
    _reset()
    buf = store.get_stars_buffer(limit=50)
    assert len(buf) == 50 * 5 * 4  # 50 rows * 5 floats * 4 bytes


def test_get_stars_buffer_no_limit_returns_all() -> None:
    _reset()
    meta = store.get_stars_meta()
    buf = store.get_stars_buffer(limit=None)
    assert len(buf) == meta.count * 5 * 4


def test_get_notable_stars_filters_to_mag_5_0() -> None:
    _reset()
    notable = store.get_notable_stars()
    # HYG full at mag <= 5.0 returns ~1637 stars (independently verified by
    # streaming the CSV), landing cleanly in the spec's "~1.5-2k" target.
    # If this drifts noticeably the catalogue itself has changed.
    assert 1400 < len(notable) < 1900, f"expected ~1.5-2k notable stars, got {len(notable)}"
    assert all(s.mag <= 5.0 for s in notable)


def test_get_constellations_returns_88_with_lines() -> None:
    _reset()
    consts = store.get_constellations()
    assert len(consts) == 88
    assert all(len(c.lines) > 0 for c in consts)


def test_get_galaxies_returns_all_pgc_g_entries() -> None:
    _reset()
    gals = store.get_galaxies()
    # PGC has ~2.7k objtype=G entries; assert we have at least an order of
    # magnitude more than the previous top-100 cut to catch regressions to a
    # hardcoded slice.
    assert len(gals) > 1000
    # Sorted descending by major_arcmin.
    assert all(gals[i].major_arcmin >= gals[i + 1].major_arcmin for i in range(len(gals) - 1))
    # Andromeda (PGC 2557, NGC 224) must be in the full set.
    andromeda = next((g for g in gals if g.id == "PGC2557"), None)
    assert andromeda is not None
    assert andromeda.tint == "cool"

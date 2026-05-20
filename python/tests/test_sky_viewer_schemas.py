from redshift_backend.schemas.sky_viewer import (
    Constellation,
    ConstellationStar,
    Galaxy,
    NotableStar,
    StarCatalogueMeta,
)


def test_star_catalogue_meta_round_trip() -> None:
    m = StarCatalogueMeta(
        count=87476,
        field_count=5,
        field_names=["ra_rad", "dec_rad", "mag", "color_index", "distance_ly"],
        dtype="float32",
        endianness="little",
    )
    assert m.model_dump()["count"] == 87476


def test_notable_star_optional_fields() -> None:
    s = NotableStar(
        id=1,
        name="Sirius",
        hd=48915,
        hr=None,
        gliese=None,
        bayer_flamsteed=None,
        proper_name="Sirius",
        ra_rad=1.7677943,
        dec_rad=-0.291751,
        mag=-1.46,
        abs_mag=None,
        spectrum="A1V",
        color_index=0.0,
        distance_ly=8.6,
    )
    assert s.mag < 0


def test_galaxy_tint_literal() -> None:
    g = Galaxy(
        id="M31",
        name="Andromeda Galaxy",
        alt_names=["NGC224"],
        ra_deg=10.6847,
        dec_deg=41.2687,
        major_arcmin=190.0,
        minor_arcmin=60.0,
        angle_deg=35.0,
        tint="cool",
        mag=3.4,
        distance_mly=2.537,
    )
    assert g.tint == "cool"


def test_constellation_has_stars_and_lines() -> None:
    c = Constellation(
        name="Andromeda",
        center_ra_h=0.139805556,
        center_dec_d=29.09055556,
        stars=[ConstellationStar(id=0, bfID="21Alp And", ra_h=0.139805556, dec_d=29.09055556)],
        lines=[(0, 1)],
    )
    assert c.lines == [(0, 1)]

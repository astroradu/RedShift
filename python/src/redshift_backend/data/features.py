from redshift_backend.schemas.feature import Feature

FEATURES: list[Feature] = [
    Feature(
        id="planner",
        num="01",
        name="Imaging Planner",
        desc="Plan deep-sky imaging sessions by object visibility across the months ahead — constellations, galaxies, and beyond.",
        meta="EPHEMERIS",
        icon="galaxy",
    ),
]

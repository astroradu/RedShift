from redshift_backend.schemas.feature import Feature

FEATURES: list[Feature] = [
    Feature(
        id="planner",
        num="01",
        name="Imaging Planner",
        desc="Plan deep-sky imaging sessions by object visibility across the months ahead - constellations, galaxies, and beyond.",
        meta="EPHEMERIS",
        icon="galaxy",
    ),
    Feature(
        id="sky",
        num="02",
        name="Sky Viewer",
        desc="Pan a live 3D night sky, trace constellations, and scrub through the hours.",
        meta="CELESTIAL",
        icon="sky-viewer",
        toolbar=False,
    ),
]

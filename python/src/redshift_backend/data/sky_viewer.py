"""Lazy-loading catalogue store for the Sky Viewer feature.

Three catalogues live here:

* HYG full star catalogue (~87,476 rows) — parsed from CSV into a packed
  float32 binary buffer of shape (N, 5) with fields
  [ra_rad, dec_rad, mag, color_index, distance_ly]. Sorted by ascending
  magnitude so that ``?limit=N`` slices return the N brightest stars.

* "Notable" star subset (mag <= 5.0, ~1.5-2k rows) - JSON-friendly objects
  with identifying metadata so the frontend can render hover/click popups
  with real names ("Vega", "Sirius A") instead of catalogue IDs.

* 88 IAU constellations - loaded from ``constellations_data.json`` with
  star positions and line segments already prepared.

* Galaxies - every objtype="G" entry from ``pgc_large_galaxies.csv`` (~2.7k
  rows), sorted by ``major_arcmin`` descending. Tiny entries (sub-arcminute)
  are sub-pixel at typical FOV and effectively invisible until the user zooms
  in past ~20°.

All four are loaded lazily on first access - keeps sidecar boot fast for
users who never open the Sky Viewer. Held in process memory after that.
Memory cost for the full star buffer: ~2 MB.
"""

from __future__ import annotations

import csv
import json
import math
import struct
import time
from pathlib import Path
from typing import cast

import structlog

from redshift_backend.core.paths import scripts_dir
from redshift_backend.schemas.sky_viewer import (
    Constellation,
    ConstellationStar,
    Galaxy,
    NotableStar,
    StarCatalogueMeta,
)

log = structlog.get_logger(__name__)

# Module-level caches.
_stars_buffer: bytes | None = None
_stars_count: int = 0
_notable_stars: list[NotableStar] | None = None
_constellations: list[Constellation] | None = None
_galaxies: list[Galaxy] | None = None

_FIELD_NAMES = ["ra_rad", "dec_rad", "mag", "color_index", "distance_ly"]
_FIELD_COUNT = len(_FIELD_NAMES)
_NOTABLE_MAG_CUTOFF = 5.0

_RA_HOURS_TO_RAD = math.pi / 12.0
_DEG_TO_RAD = math.pi / 180.0


def _hyg_csv_path() -> Path:
    return scripts_dir() / "assets" / "hygfull.csv"


def _constellations_json_path() -> Path:
    return scripts_dir() / "assets" / "constellations_data.json"


def _pgc_csv_path() -> Path:
    return scripts_dir() / "assets" / "pgc_large_galaxies.csv"


def _build_display_name(proper_name: str | None, bayer_flamsteed: str | None, hd: int | None) -> str:
    if proper_name and proper_name.strip():
        return proper_name.strip()
    if bayer_flamsteed and bayer_flamsteed.strip():
        return bayer_flamsteed.strip()
    if hd is not None:
        return f"HD {hd}"
    return "Unnamed"


def _parse_optional_int(s: str) -> int | None:
    s = s.strip()
    if not s:
        return None
    try:
        return int(s)
    except ValueError:
        return None


def _parse_optional_float(s: str) -> float | None:
    s = s.strip()
    if not s:
        return None
    try:
        v = float(s)
    except ValueError:
        return None
    return v if math.isfinite(v) else None


def _load_stars() -> None:
    """Parse hygfull.csv into the packed buffer and the notable-stars list."""
    global _stars_buffer, _stars_count, _notable_stars

    path = _hyg_csv_path()
    if not path.exists():
        raise RuntimeError(f"HYG catalogue not found at {path}")

    t0 = time.perf_counter()
    rows: list[tuple[float, float, float, float, float]] = []
    notable: list[tuple[float, NotableStar]] = []

    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            ra_h = _parse_optional_float(row["RA"])
            dec_d = _parse_optional_float(row["Dec"])
            mag = _parse_optional_float(row["Mag"])
            if ra_h is None or dec_d is None or mag is None:
                continue
            ra_rad = ra_h * _RA_HOURS_TO_RAD
            dec_rad = dec_d * _DEG_TO_RAD
            ci = _parse_optional_float(row["ColorIndex"]) or 0.0
            distance = _parse_optional_float(row["Distance"]) or 0.0
            rows.append((ra_rad, dec_rad, mag, ci, distance))

            if mag <= _NOTABLE_MAG_CUTOFF:
                star_id = int(row["StarID"])
                proper_name = row["ProperName"].strip() or None
                bf = row["BayerFlamsteed"].strip() or None
                hd = _parse_optional_int(row["HD"])
                hr = _parse_optional_int(row["HR"])
                gliese = row["Gliese"].strip() or None
                spectrum = row["Spectrum"].strip() or None
                abs_mag = _parse_optional_float(row["AbsMag"])
                notable.append(
                    (
                        mag,
                        NotableStar(
                            id=star_id,
                            name=_build_display_name(proper_name, bf, hd),
                            hd=hd,
                            hr=hr,
                            gliese=gliese,
                            bayer_flamsteed=bf,
                            proper_name=proper_name,
                            ra_rad=ra_rad,
                            dec_rad=dec_rad,
                            mag=mag,
                            abs_mag=abs_mag,
                            spectrum=spectrum,
                            color_index=ci,
                            distance_ly=distance if distance > 0 else None,
                        ),
                    )
                )

    rows.sort(key=lambda r: r[2])
    notable.sort(key=lambda r: r[0])

    packer = struct.Struct(f"<{_FIELD_COUNT}f")
    parts = [packer.pack(*r) for r in rows]
    _stars_buffer = b"".join(parts)
    _stars_count = len(rows)
    _notable_stars = [s for _, s in notable]

    took_ms = (time.perf_counter() - t0) * 1000.0
    log.info(
        "sky_viewer.catalogue_loaded",
        star_count=_stars_count,
        notable_count=len(_notable_stars),
        took_ms=round(took_ms, 1),
    )


def get_stars_meta() -> StarCatalogueMeta:
    if _stars_buffer is None:
        _load_stars()
    return StarCatalogueMeta(
        count=_stars_count,
        field_count=_FIELD_COUNT,
        field_names=_FIELD_NAMES,
        dtype="float32",
        endianness="little",
    )


def get_stars_buffer(limit: int | None) -> bytes:
    if _stars_buffer is None:
        _load_stars()
    buf = cast(bytes, _stars_buffer)
    if limit is None or limit >= _stars_count:
        return buf
    if limit <= 0:
        return b""
    return buf[: limit * _FIELD_COUNT * 4]


def get_notable_stars() -> list[NotableStar]:
    if _notable_stars is None:
        _load_stars()
    return cast(list[NotableStar], _notable_stars)


def _load_constellations() -> None:
    global _constellations
    path = _constellations_json_path()
    if not path.exists():
        raise RuntimeError(f"Constellation catalogue not found at {path}")

    data = json.loads(path.read_text(encoding="utf-8"))
    out: list[Constellation] = []
    for entry in data["Constellations"]:
        out.append(
            Constellation(
                name=entry["Name"],
                center_ra_h=entry["RAh"],
                center_dec_d=entry["DEd"],
                stars=[
                    ConstellationStar(
                        id=s["id"],
                        bfID=s["bfID"],
                        ra_h=s["RAh"],
                        dec_d=s["DEd"],
                    )
                    for s in entry["stars"]
                ],
                lines=[(a, b) for a, b in entry["lines"]],
            )
        )
    _constellations = out


def get_constellations() -> list[Constellation]:
    if _constellations is None:
        _load_constellations()
    return cast(list[Constellation], _constellations)


def _load_galaxies() -> None:
    """Stream pgc_large_galaxies.csv, keep objtype=G, sort by angular size."""
    global _galaxies

    path = _pgc_csv_path()
    if not path.exists():
        raise RuntimeError(f"PGC catalogue not found at {path}")

    t0 = time.perf_counter()
    rows: list[tuple[float, dict[str, str]]] = []
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("objtype") != "G":
                continue
            major = _parse_optional_float(row["major_arcmin"])
            if major is None or major <= 0:
                continue
            rows.append((major, row))

    rows.sort(key=lambda t: -t[0])

    out: list[Galaxy] = []
    for major, row in rows:
        ra = _parse_optional_float(row["ra_deg"])
        dec = _parse_optional_float(row["dec_deg"])
        if ra is None or dec is None:
            continue
        minor = _parse_optional_float(row["minor_arcmin"]) or major
        # PGC carries bt_mag (Johnson B) and vt_mag (Johnson V); prefer V
        # (closer to visual perception). Distance is already Mly in the CSV.
        mag = _parse_optional_float(row["vt_mag"]) or _parse_optional_float(row["bt_mag"])
        distance = _parse_optional_float(row["distance_mly"])
        alt_names_raw = row.get("alt_names", "") or ""
        alt_names = [n.strip() for n in alt_names_raw.split(",") if n.strip()]

        out.append(
            Galaxy(
                id=f"PGC{row['pgc']}",
                name=row["objname"],
                alt_names=alt_names,
                ra_deg=ra,
                dec_deg=dec,
                major_arcmin=major,
                minor_arcmin=minor,
                # PGC doesn't carry position angle. Derive a pseudo-random
                # angle from the PGC number so each galaxy points a different
                # way while staying stable across reloads. Golden-ratio
                # multiplier gives low-discrepancy scatter — neighbouring
                # PGCs don't land at neighbouring angles.
                angle_deg=((int(row["pgc"]) * 1.6180339887) % 1.0) * 360.0,
                tint="cool",
                mag=mag,
                distance_mly=distance,
            )
        )

    _galaxies = out
    took_ms = (time.perf_counter() - t0) * 1000.0
    log.info(
        "sky_viewer.galaxies_loaded",
        galaxy_count=len(out),
        took_ms=round(took_ms, 1),
    )


def get_galaxies() -> list[Galaxy]:
    if _galaxies is None:
        _load_galaxies()
    return cast(list[Galaxy], _galaxies)

<div align="center">

# RedShift

**A quiet workshop for the night sky.**

Plan your astrophotography sessions with precision — score every constellation and thousands of PGC galaxies by visibility, right from your observing site.

[![Version](https://img.shields.io/badge/version-1.0.1-blue?style=flat-square)](https://github.com/astroradu/RedShift/releases)
[![License](https://img.shields.io/badge/license-Source_Available-orange?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS-lightgrey?style=flat-square)](#download)

</div>

---

<p align="center">
  <img src="docs/screenshots/overview.png" alt="RedShift — astrophotography planning toolkit" width="860" />
</p>

---

## Overview

RedShift is a desktop toolkit for **planning astrophotography sessions**. It takes your observing site, looks at where every target is in the sky over the next weeks or months, and tells you when and how long each one will be high enough to image.

> RedShift focuses on **session planning**, not capture or post-processing. Only the **Imaging Planner** is fully functional today — the other module tiles are reserved for future work.

---

## Tech Stack

<div align="center">

![React](https://img.shields.io/badge/React_18-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite_6-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS_Custom-1572B6?style=for-the-badge&logo=css3&logoColor=white)

![Python](https://img.shields.io/badge/Python_3.12-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi&logoColor=white)
![Pydantic](https://img.shields.io/badge/Pydantic_v2-E92063?style=for-the-badge&logo=pydantic&logoColor=white)
![astropy](https://img.shields.io/badge/astropy-FF7F0E?style=for-the-badge&logo=python&logoColor=white)

![Tauri](https://img.shields.io/badge/Tauri_2-24C8DB?style=for-the-badge&logo=tauri&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white)

</div>

<br/>

RedShift is a **Tauri 2** native desktop app with a **React 18 + TypeScript** frontend and a bundled **Python 3.12 + FastAPI** sidecar. The Rust shell owns the native window, spawns and supervises the sidecar, and exposes exactly one system-level integration (CoreLocation on macOS). All application logic runs in the Python backend over authenticated HTTP on loopback — which means real computation scripts can plug in by replacing service implementations without touching the frontend.

No third-party UI kit is used. Every component is hand-rolled with a custom CSS variable design system, built for dark observing conditions.

---

## Modules

| # | Module | Status | Description |
|---|--------|:------:|-------------|
| 01 | **Image Stacker** | Mock | Align and integrate light frames — layers panel, σ-clip stats, live merge progress. |
| 02 | **Star Tracker** | Placeholder | Plate-solve and lock onto guide stars. |
| 03 | **Imaging Planner** | **Implemented** | Score all 88 IAU constellations and thousands of PGC galaxies by visibility. Backed by real `astropy` / `astroplan` computation. |
| 04 | **Telescope Control** | Placeholder | Slew, focus, rotate connected mounts. |
| 05 | **Dark Frame Analyzer** | Placeholder | Sensor noise, hot-pixel and thermal inspection. |

---

## Imaging Planner

The Imaging Planner has two tools: the **Constellation Planner** and the **Galaxy Planner**.

---

### Constellation Planner

Ranks all **88 IAU constellations** by visibility across your chosen window, calculated against your exact observing coordinates.

**Time frame** — 1 Month, 3 Months, 6 Months, or One Year. Default is *3 Months*.

**Computation precision** — a 5-step slider from *Lowest* to *Highest*, controlling how densely the engine samples each night and month. *Low* is the default and is usually fine.

#### Results

<p align="center">
  <img src="docs/screenshots/constellation-planner-results.png" alt="Constellation Planner — results view" width="860" />
</p>

At the top, **hero cards** surface your best target — and a second card for the best target with a defined rising window when the top result stays fixed in the sky all night.

Below, a **heatmap table** shows every constellation with one cell per month, colored by score. Sort by any column; switch between *Heatmap*, *Numbers*, and *Sparkline* views.

<p align="center">
  <img src="docs/screenshots/constellation-planner-heatmap.png" alt="Constellation Planner — heatmap table" width="860" />
</p>

---

### Galaxy Planner

Runs the same calculations against the **PGC large-galaxy catalogue** — thousands of entries with morphology, photometry, and angular size.

**Angular size filter** — pre-filter the catalogue before scoring: All, >3′, >8′, >12′, or >18′. Filtering makes runs significantly faster.

**Computation precision** — a 3-step slider: *Standard*, *High*, *Maximum*.

**Compute non-standard galactic types** — off by default. Enable to include non-confirmed entries alongside standard galaxies.

#### Results

<p align="center">
  <img src="docs/screenshots/galaxy-planner-results.png" alt="Galaxy Planner — results table" width="860" />
</p>

A **paginated heatmap table** (100 rows per page) with per-month scores, best month, total, and full catalogue metadata. Click any row to open a detail popup. Results for each combination of settings are cached for the session — switching between them is instant.

---

## Reading the Visibility Score

The score is a unitless measure of **usable dark-sky time** for a target across the sampled timestamps. Higher is better. Compare scores within the same run — absolute numbers vary by precision setting.

The **Best Month** column shows when a target peaks; **Total** is the cumulative score across the window. Switch to *Numbers* for raw values or *Sparkline* to see the visibility curve shape at a glance.

> Treat the score as a **filter, not a verdict**. It tells you what's visible — not what's worth shooting. Object size, brightness, and light pollution are yours to weigh.

---

## Setting Your Location

Every calculation needs your **latitude and longitude**. Open **Settings** from the top-right gear icon.

**System location (macOS)** — click **Get System Location** for a one-tap coarse fix via CoreLocation.

**Manual entry** — type decimal degrees into the Latitude and Longitude fields and click **Save**. Latitude range: `-90` to `90`; longitude: `-180` to `180`.

Once set, your coordinates appear in the header strip of every planner start screen.

---

## Appearance

**Dark and light mode** — toggle from the top-right sun/moon icon or from Settings. The whole UI flips instantly.

**Palettes** — seven hand-tuned color palettes, each in dark and light: Aurora, Nebula, Mars, Ember, Verdant, Monochrome, and Solar. Preview them in the Settings grid; your choice is remembered across restarts.

---

## Download

Pre-built binaries for macOS are available on the [**Releases**](https://github.com/astroradu/RedShift/releases) page.

| Platform | Format |
|----------|--------|
| macOS | `.dmg` |

---

<div align="center">

*RedShift — source available. See [LICENSE](LICENSE) for terms.*

</div>

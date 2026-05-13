---
id: galaxy-planner
file: galaxy-planner.md
category: Modules
title: The Galaxy Planner
blurb: Score thousands of PGC galaxies by visibility, with filters for angular size and type.
readTime: 7 min
updated: May 09, 2026
icon: galaxy
order: 3
---

# The Galaxy Planner

The Galaxy Planner runs the same family of calculations as the Constellation Planner, but against the **PGC large-galaxy catalogue** rather than 88 constellations. The dataset is much larger, so the controls and the results are shaped differently.

## What's in the catalogue

The catalogue is the bundled `pgc_large_galaxies.csv` — the Principal Galaxies Catalogue's large-object subset, with morphology, photometry, and angular size for each entry.

Each row has an `objtype` field. By default the planner scores only rows with **`objtype = G`** — confirmed galaxies — and skips everything else (parts of galaxies, unconfirmed objects, foreground stars, non-galactic PGC entries). You can opt in to scoring the full file with a checkbox on the start screen.

## What you set on the start screen

Four controls.

### Time frame

Same four buttons as the Constellation Planner: **1 Month**, **3 Months**, **6 Months**, **One Year**. Default is *3 Months*.

### Computation precision

A 3-step slider (not 5 — the dataset is too large for 5 to be useful) with these mappings:

| Label    | Pivots / night | Days / month |
|----------|---------------:|-------------:|
| Standard |              3 |            5 |
| High     |              5 |            7 |
| Maximum  |              8 |            8 |

*Standard* is the default. The label under the slider always shows the exact pair, e.g. *Standard · 3 pivots/night × 5 days/month*.

### Angular size filter

A row of five buttons that pre-filter the catalogue by minimum apparent size:

- **All** — no filter (every row in the catalogue).
- **> 3′** — three arcminutes and larger. Useful filter for casual imaging from a typical apo.
- **> 8′** — eight arcminutes and larger. Wide-field territory.
- **> 12′**
- **> 18′** — only the very largest, well-known galaxies.

A galaxy's angular size is roughly how big it appears on the sky. The Andromeda Galaxy (M31) is about 3°, M33 is around 70′, most others are far smaller. Filtering trims the dataset *before* scoring — running with **> 3′** is much faster than **All**.

### Compute non-standard galactic types

A checkbox under the precision slider. **Off by default.**

When off, only `objtype = G` rows are scored. When on, every PGC row in the file is scored regardless of its `objtype` (galaxy parts, candidates, non-galactic entries). The result count will roughly double; runtime increases accordingly.

Leave it off unless you specifically want non-canonical entries in your output.

## Running it

Same five-step status flow as the constellation engine, but for galaxies:

1. Loading galaxy catalogue
2. Building observer
3. Precomputing twilight windows
4. Computing altitudes
5. Scoring galaxies

The engine streams the catalogue from disk row-by-row (it never loads the whole file at once), so memory use stays flat.

> **Each combination of (time frame, non-standard toggle, angular size) is cached separately.** Toggle the non-standard option, recalculate, then untick it — switching back is instant because both result sets are still in memory. The cache clears when the app closes.

## What the results show

There's no hero card here — the dataset is too long for "the top one" to be meaningful on its own. Instead you get a **paginated heatmap table**.

- **PGC** — the catalogue identifier for that row (e.g. `PGC2557`).
- **One column per month** in your window, colored by score.
- **Best Month** — the month where this galaxy peaks.
- **Total** — cumulative score across the window.
- **Metadata columns** — morphology, photometry, distance, and angular size, pulled directly from the catalogue.

The table is paginated at **100 rows per page**. The pagination strip lives at the bottom of the screen.

### Row details

Click any row to open a centered detail popup with the full metadata for that galaxy: every catalogue field, plus the per-month score breakdown. Click outside the popup, or press `Escape`, to close it.

## Performance notes

This module is significantly heavier than the constellation one because there are thousands of galaxies instead of 88. Rough orders of magnitude on a modern laptop:

- **Standard precision, > 3′ filter, 3-month window, G only**: a few seconds.
- **Maximum precision, no filter, 12-month window, all objtypes**: tens of seconds.

The header **SCORED ROWS** field shows how many galaxies were evaluated, and **ENGINE RUNTIME** the wall time.

## See also

- *The Constellation Planner* — same idea, smaller dataset.
- *Reading the visibility score* — what the score number means.

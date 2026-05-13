---
id: constellation-planner
file: constellation-planner.md
category: Modules
title: The Constellation Planner
blurb: Rank all 88 IAU constellations by how much usable dark sky time they have over an upcoming window.
readTime: 5 min
updated: May 06, 2026
icon: constellation
order: 2
---

# The Constellation Planner

The Constellation Planner takes your site, your time frame, and a precision setting, and ranks all **88 IAU constellations** by visibility. It runs the bundled `constellation_scorer.py` engine against your coordinates and streams progress back to the UI.

## What you set on the start screen

Three controls, top to bottom.

### Time frame

A row of four buttons:

- **1 Month** — fastest, useful for "what's good *right now*".
- **3 Months** — the default. Roughly a full astrophotography season.
- **6 Months**
- **One Year** — every constellation will appear, since the whole sky cycles through.

The wider the window, the more pivot timestamps the engine evaluates.

### Computation precision

A 5-step slider — *Lowest*, *Low*, *Medium*, *High*, *Highest* — which controls how densely the engine samples each month and each night.

| Label   | Pivots / night | Days / month | Total samples (3-month window) |
|---------|---------------:|-------------:|-------------------------------:|
| Lowest  |              1 |            1 |                              3 |
| Low     |              3 |            3 |                             27 |
| Medium  |              5 |            5 |                             75 |
| High    |              7 |            7 |                            147 |
| Highest |             10 |           10 |                            300 |

*Low* is the default and is usually fine. Bump to *Medium* or *High* if you want smoother monthly scores — at *Highest*, the One Year window evaluates 1,200 timestamps per constellation, which is slower but maximally precise.

The header strip at the top of the screen shows the current sample density as **SAMPLE n×n**.

## Running it

Hit **Calculate**. The screen switches to a loader-ring with a five-step status:

1. Loading constellation data
2. Building observer
3. Precomputing twilight windows
4. Computing altitudes
5. Scoring constellations

Progress comes back live over SSE — if the engine has anything to say (an error, a missing dependency), it'll surface as a toast and you'll land back on the start screen.

## What the results show

The results view has two parts.

### The hero cards

At the top, one or two large cards:

- **Top Constellation · Highest Score** — always shown. This is whichever constellation has the highest cumulative visibility score across your window.
- **Top Non-Circumpolar · Best Rising Target** — shown only if the top constellation is circumpolar (never sets below your horizon) and there is a different best target that *does* rise and set. Circumpolar targets are great for long stretches near the pole, but they don't have a defined imaging window the way a target that rises in the east and sets in the west does. The second card surfaces a target with a real window.

Each card lists the score, the best month, the peak monthly score, and whether the target rises and sets.

### The heatmap table

Below the cards, every constellation appears as a row with one cell per month in your window. The cells are colored by score — darker = higher. The **Best Month** column is the month where that constellation peaks, and **Total** is the cumulative score across the whole window.

The toolbar offers *Heatmap*, *Numbers*, and *Sparkline* chips for switching how the cells render.

> If you only care about *when* the score is best, click the **Best Month** column header to sort. If you care about the absolute peak, sort by **Total**.

## Performance notes

The engine is vectorised, so doubling the precision does **not** double the runtime — it's closer to a linear-in-samples cost on a single CPU. On a modern laptop:

- A 3-month, *Low* run finishes in a couple of seconds.
- A 12-month, *Highest* run takes ~30–60 seconds.

The header **ENGINE RUNTIME** field on the results screen shows the actual wall time of the last run.

## See also

- *Reading the visibility score* — what the score number means and how the colors are picked.
- *The Galaxy Planner* — the same idea applied to thousands of PGC galaxies.

---
id: visibility-score
file: visibility-score.md
category: Workflow
title: Reading the visibility score
blurb: What the numbers in the results tables mean — and why a high score does not always mean a good target.
readTime: 4 min
updated: May 10, 2026
icon: eye
order: 4
---

# Reading the visibility score

Both planners produce a **visibility score** for each target, per month and as a window total. This page explains what the score represents, how to read the heatmap, and the difference between a *visible* target and a *good imaging* target.

## What the score is

The score is a unitless measure of **usable dark-sky time** for that target, accumulated across the pivots the engine sampled.

In practical terms: for each timestamp the engine evaluated, it checks whether the target is above your altitude floor *and* the sky is dark (between astronomical twilights). If both are true, it contributes to that target's score. Higher precision settings sample more timestamps per month, which produces smoother — but not necessarily *higher* — scores.

> The score is **not** "hours of dark time". It's a sampled estimate proportional to it. Two runs at different precisions will produce different absolute numbers for the same target. Compare scores **within the same run**, not across runs with different settings.

## Reading the heatmap

In the results table, each cell shows the score for one target in one month. Cells are colored from low (background) to high (accent color), and the highest-scoring cell in each row gets a brighter accent border.

- The **Best Month** column says which month the row peaks in.
- The **Total** column is the sum across the window.

Switching the toolbar chip from *Heatmap* to *Numbers* shows the raw score in each cell. *Sparkline* draws a small line across the row so you can see the shape of the visibility curve at a glance.

## Circumpolar vs rises-and-sets

The Constellation Planner highlights this distinction explicitly in the hero cards.

A **circumpolar** target never crosses below your horizon. From a mid-northern site, much of the area around the celestial pole — Ursa Minor, Cepheus, Draco, Cassiopeia — never sets. These targets tend to dominate the leaderboard because they accumulate dark-sky time *every single night* of the year.

A target that **rises and sets** has a defined imaging window each night — it climbs out of the east, transits, and drops into the west. The window is shorter, but it's often when the target is also *high* and unaffected by horizon murk.

If you want a clean meridian-flip workflow with a clear start and end to your session, the **Top Non-Circumpolar** card is usually what you want, not the absolute leaderboard winner.

## A high score is not the whole story

Visibility is only one ingredient in choosing a target. The planner says nothing about:

- **Object size** — a galaxy or constellation can be perfectly placed at midnight and still be too small for your focal length.
- **Brightness** — the planner does not weight by magnitude. A faint smudge gets the same score as a bright Messier.
- **Light pollution** — RedShift assumes a generic astronomical-twilight model. Real local conditions vary.
- **What's interesting** — taste, framing, and what you've already shot are not in the data.

> Treat the planner as a filter, not a verdict. It narrows hundreds of candidates down to a handful that are *visible*; pick the one that's also *worth shooting*.

## See also

- *The Constellation Planner* and *The Galaxy Planner* — where these scores come from.

---
id: welcome
file: welcome.md
category: Essentials
title: Welcome to RedShift
blurb: What the app does, how the workspace is laid out, and the one thing to set before you do anything else.
readTime: 3 min
updated: May 04, 2026
icon: sparkle
order: 1
---

# Welcome to RedShift

RedShift is a desktop toolkit for **planning astrophotography sessions**. It takes your observing site, looks at where every target is in the sky over the next weeks or months, and tells you when and how long each one will be high enough to image.

> RedShift focuses on **session planning**, not capture or post-processing. It does not control a mount, run a camera, or stack frames. Some module tiles in the home grid are placeholders for future work — only the **Imaging Planner** is fully functional today.

## The home screen

When you launch the app, you see a grid of module cards. Click any card to enter that module. The fully implemented one is:

- **Imaging Planner** — forecasts visibility for the 88 IAU constellations and the PGC galaxy catalogue.

The other tiles are reserved for future modules. Clicking them opens a placeholder.

## Inside a module

Once you're in a module, the layout is consistent:

- **Top bar** — RedShift logo on the left, breadcrumb in the middle, theme toggle and settings on the right.
- **Left rail (sidebar)** — module-specific tools. The Imaging Planner exposes two: *Constellation Planner* and *Galaxy Planner*. The two buttons at the foot of the rail are global: documentation (the icon you're using right now) and settings.
- **Main panel** — the active tool.

To return to the home grid, click the breadcrumb at the top, or the RedShift logomark.

## Set your location first

Every planner calculation needs an observing latitude and longitude. **If no location is set, the planner will refuse to run** and a toast will tell you so.

On macOS, the app can ask the OS for your coarse location (a one-tap button in *Settings → Location*). On any platform, you can also type the numbers in by hand.

Location lives in memory only — it is **not persisted to disk**. You'll set it once per cold start. See *Setting your location* for details.

## What to read next

- *The Constellation Planner* — the simpler of the two planners; a good first run.
- *The Galaxy Planner* — much larger dataset, with filters for galaxy size and type.
- *Reading the visibility score* — what the numbers in the results table actually mean.

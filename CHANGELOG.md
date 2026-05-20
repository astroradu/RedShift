## v1.1.1 — Borealis Release

### ✨ New

**Sky Viewer**

- Real-time 3D rendering of the night sky over your observing site, powered by a WebGL particle scene drawing every star in the HYG catalogue sized and coloured by magnitude and B–V index.
- Sun and Moon rendered with soft halos and correct phase terminator for any moment in time.
- IAU constellation stick figures and thousands of PGC large galaxies drawn as elliptical smudges at their real angular size and orientation.
- Independent layer toggles for stars, Sun, Moon, constellation lines, galaxies, equatorial grid, horizon ring, ground plane, and cardinal labels.
- Three projection modes: Stereographic (default, conformal wide-angle), Fisheye (full hemisphere), and Rectilinear (tight fields).
- Drag to pan, scroll or pinch to zoom, click any star or galaxy to open a detail card with its full catalogue entry and live alt/az for your location and time.
- Search by star name or galaxy identifier — results update as you type and respect your active layer toggles.
- 24-hour time scrubber with a sky-darkness gradient track, astronomical night boundary markers, moon rise/set ribbon, and one-tap presets (Tonight 22:00, Astro midnight, Reset to now).
- Moon chip showing current phase, illumination percentage, and altitude, updated as you scrub.
- Three catalogue density options (Full, Balanced, Performance) and a Visual/True 1:1 galaxy size toggle.

---

## v1.0.2 — macOS Gatekeeper fix

Fixes a crash on macOS where the app wouldn't open after install.

---

## v1.0.1 — First public release

RedShift is a desktop toolkit for planning astrophotography sessions. This is its first public release. Everything you see is new.

The app ships as a single native executable for macOS — no installer steps, no Python environment to manage. Open it, set your location, and plan.

---

### ✨ New

**Imaging Planner — Constellation Planner**

- Rank all 88 IAU constellations by how much usable dark-sky time they have over your chosen window, calculated against your exact observing coordinates.
- Choose a time frame of 1, 3, 6, or 12 calendar months to match your planning horizon.
- Control how densely the engine samples each night and month with a 5-step precision slider (Lowest through Highest).
- Watch calculation progress live through a five-step status display as the engine works.
- See the top result in a hero card that always surfaces your single best target, plus a separate "best rising target" card when the leaderboard is dominated by a circumpolar object.
- Browse every constellation in a colour-coded heatmap table — one column per month, sorted by any column you like.
- Jump straight back to your last results at any time during the session without re-running the calculation.

**Imaging Planner — Galaxy Planner**

- Score thousands of PGC large-galaxy catalogue entries by visibility, using the same engine family as the Constellation Planner.
- Filter the catalogue by minimum apparent angular size — All, >3′, >8′, >12′, or >18′ — to trim the dataset before the engine runs.
- Optionally include non-standard galactic object types (galaxy parts, candidates, unconfirmed entries) with a single checkbox.
- Page through results 100 rows at a time with an ellipsis-collapsed pagination strip.
- Click any galaxy row to open a detail popup with its full catalogue metadata: morphology, photometry, distance, angular size, and a per-month score breakdown.
- Results for each combination of time frame and type filter are cached separately, so toggling between them is instant for the rest of your session.

**Location**

- Set your observing latitude and longitude once in Settings, and every planner calculation picks it up automatically.
- Enter coordinates manually in decimal degrees, with range validation on both fields.
- Your active location is shown in the header strip of every planner start screen so you always know what coordinates will be used.

**Appearance**

- Switch between dark and light surfaces from the top-right toggle or from Settings — the whole UI flips instantly.
- Choose from seven hand-tuned colour palettes: Aurora, Nebula, Mars, Ember, Verdant, Monochrome, and Solar, each available in both dark and light variants.
- Preview each palette in the Settings grid before selecting — the checked card is your active palette.
- The planner heatmap uses your active palette accent colour, so switching palettes can also improve table legibility.
- Your chosen mode and palette are remembered across app restarts.

**Notifications**

- Toast messages appear beneath the top bar for errors, warnings, info notices, successes, and live progress updates — up to five at once, auto-dismissed after six seconds.
- All notifications are also collected in the bell tray in the top bar, accessible at any time during the session.

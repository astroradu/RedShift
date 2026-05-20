---
id: sky-viewer
file: sky-viewer.md
category: Modules
title: The Sky Viewer
blurb: A live 3D night sky for your location - pan, zoom, scrub through time, and click any star or galaxy to read its catalogue entry.
readTime: 6 min
updated: May 18, 2026
icon: sky-viewer
order: 5
---

# The Sky Viewer

The Sky Viewer is a real-time 3D rendering of the sky over your observing site. It draws every star in the HYG catalogue, the visible Sun and Moon, the IAU constellation lines, and thousands of PGC galaxies, all positioned for **your** latitude, longitude, and whatever moment the time scrubber is parked on.

> The viewer is for exploration and orientation, not session scoring. To rank targets by usable dark-sky time, use the *Constellation Planner* or *Galaxy Planner*. Reach for the Sky Viewer when you want to *see* the sky, not when you want a leaderboard.

## Launching it

From the home grid, click the **Sky Viewer** card. The viewer takes the whole window; there's no left sidebar inside this module, since the canvas needs the space.

The **Info** button in the bottom-left corner brings you back into the documentation. The breadcrumb at the top-right (and the RedShift logomark in the top-left) take you back to the home grid.

If no location is set, the viewer still opens but renders the sky as seen from `(0°, 0°)`. Set your location in *Settings → Location* before doing serious orientation work.

## What's on screen

The view is built from several layers, each independently toggleable from the top-right toolbar:

- **Stars** - the full HYG catalogue, sized and colored by magnitude and B–V color index. Brighter stars sit on top.
- **Sun** - drawn with a soft halo when above the horizon.
- **Moon** - drawn with the correct phase shape for the current moment; the unlit side is dark.
- **Constellation lines** - the 88 official IAU stick figures.
- **Galaxies** - the PGC catalogue's large-object subset, drawn as elliptical smudges at their real angular size and orientation.
- **Grid** - equatorial RA/Dec with labels at coarse and fine spacing.
- **Horizon** - a glowing ring around your local horizon.
- **Ground** - a subtle floor below the horizon so the lower hemisphere reads as "down".
- **Labels** - cardinal direction tags (**N**, **NE**, **E** …) and constellation names.

What the viewer draws changes with zoom. At a wide field of view you see roughly the naked-eye sky, so only the brighter stars are visible. As you zoom in, more and dimmer stars appear, down to roughly magnitude 9 at the deepest zoom. You never have to ask for "more stars". The catalogue is always loaded; the viewer just decides which ones are worth drawing at the current zoom.

## Navigating

Your mouse, scroll wheel, and touch gestures drive the viewer directly.

- **Drag** - click and drag anywhere on the sky to pan. The sky moves with your cursor, like dragging a map.
- **Scroll** - scroll up to zoom in, scroll down to zoom out. The field-of-view readout in the bottom-right shows the current FOV in degrees.
- **Pinch** - on a trackpad, pinch to zoom continuously.
- **Click** - click a star or galaxy to select it. A crosshair appears on the object and a detail card slides in at the top-left with its full catalogue entry.
- **Double-click** - same as click, but the camera also re-centers on the object you picked.
- **Click empty sky** - clears the current selection.

The bottom-right corner has **+**, **−**, and a **reset** button for keyboard-free zooming and a one-tap return to the default view.

> Clicking through a dim catalogue star to reach a galaxy underneath works the way you'd expect. If the star has no named identity (no Bayer letter, no HD number, just a faint background entry), the click falls through to whatever else is under your cursor: galaxy, then empty sky.

## Searching

The **search pill** in the top-right expands when clicked. Type any star name or galaxy ID (Vega, Andromeda, M31, PGC2557) and the top matches appear as you type. Click a result to select it and re-center the camera on it.

The search respects your visibility toggles: hide the Stars layer and stars vanish from the results. If a query has no matches but *would* match a star or galaxy in a hidden layer, the empty state tells you so.

## Projection modes

Three projection toggles sit at the very left of the top-right toolbar:

- **Rectilinear** - straight lines stay straight, but the horizon and grid look flat. Best for a narrow-field view (zoomed in past about 60°). Maximum field-of-view: 110°.
- **Fisheye** - a wide hemispherical bowl. The whole sky-dome fits on screen at once. Good for seeing the relationship between rising and setting parts of the sky.
- **Stereographic** *(default)* - a conformal wide-angle projection that bends straight lines but keeps small shapes (constellation patterns, galaxy ellipses) undistorted. Comfortable across the full zoom range and the recommended default.

> If the horizon looks oddly flat or the constellations near the edges seem stretched, switch projection. Rectilinear is the culprit at wide fields of view; try Stereographic instead.

## Star and galaxy density

Three density options in the toolbar let you trade catalogue completeness for rendering smoothness:

- **Full** *(default)* - the entire catalogue.
- **Balanced** - roughly half the catalogue, prioritising the closer and larger objects.
- **Performance** - a small subset (the few thousand brightest stars, the hundred largest galaxies). Use this on integrated graphics or older machines if the view stutters.

Density and zoom-based culling are independent. The viewer still drops dim stars when you zoom out, regardless of which density you pick. Density just sets the upper bound.

## Galaxy display mode

- **Visual size** *(default)* - galaxies are drawn slightly enlarged so M31, M33, the LMC, and other large objects are obvious even from far out. Easier to spot when scanning.
- **True 1:1 size** - galaxies are drawn at their real angular size on the sky. Useful for framing checks: if a galaxy is too small to see clearly at your zoom in this mode, it'll also be too small in your imaging frame at the matching focal length.

## Time scrubber

The bar across the bottom of the screen is the **timeline**. It controls the moment the sky is computed for. Change it and the whole scene re-renders for the new instant.

- The big readout on the left shows the current date and time (24-hour, local). Click it to open a date/time picker with quick presets like **Tonight 22:00**, **Astro midnight**, and **Reset to now**.
- The center strip is a 24-hour scrubber. **Midnight** sits in the center; **noon** is at both ends. Drag the handle to scrub through the day. The track is colored by the sky color at each hour for your location, so you can see at a glance when astronomical night starts and ends. Small anchors mark the boundaries of astronomical night (Sun below −18°).
- A faint moon ribbon arcs across the track showing when the Moon is above the horizon for the selected day; small moon icons mark its rise and set.
- **−1 day** / **+1 day** buttons shift the date by a full calendar day.
- **Today** snaps to the current moment and turns on live ticking. The sky updates once per second until you scrub again.

The **moon chip** on the right shows the current phase, illumination percentage, and altitude. It updates as you scrub.

## Selection card

When you click an object, the **selection card** appears in the top-left:

- For a **star**, it shows the proper name (if any), Bayer/HD/HR/GL identifiers, magnitude, absolute magnitude, B–V color, distance in light-years, equatorial coordinates (RA/Dec), and the live alt/az for your current time and location.
- For a **galaxy**, it shows the PGC identifier, morphology, magnitude, distance in millions of light-years, angular size, position angle, and the same equatorial and horizontal coordinates.

Click anywhere outside the card to dismiss it, or click another object to swap.

## Tips

- **Zoom out for the naked-eye view.** At 110° (the maximum for rectilinear; beyond that you have to switch to stereographic), only stars visible to the unaided eye are drawn. This is the right zoom for "what would I see if I stepped outside right now?".
- **Zoom all the way in to find faint targets.** At 10° you see down to roughly magnitude 9, well below naked-eye and deep into binocular territory. Useful for tracking down faint galaxies near a known bright star.
- **Pick a star, then scrub time.** The selected object's crosshair stays attached as the sky rotates, so you can watch your target rise from the eastern horizon and climb to transit.
- **Use the timeline gradient to find astronomical night.** The dark band in the middle of the scrubber is when the Sun is below −18°. The anchor ticks mark the exact boundaries.
- **Hide the ground if you want to see below the horizon.** Useful for planning an early-morning shoot of a target that hasn't risen yet.
- **Switch to True 1:1 galaxy size for framing.** If a galaxy looks tiny at the field of view you'd shoot it at, your sensor will see it tiny too.

## See also

- *The Constellation Planner* - find the best constellations to image over an upcoming window.
- *The Galaxy Planner* - same, applied to thousands of PGC galaxies.
- *Setting your location* - without a location, the viewer can't compute alt/az correctly.

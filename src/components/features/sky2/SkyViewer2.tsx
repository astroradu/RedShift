import { useCallback, useEffect, useRef, useState } from 'react';
import { STRINGS } from '../../../lib/strings';
import { Icon } from '../../icons/Icon';
import { apiFetch, fetchBinary } from '../../../lib/api';
import { julianDate, lst as computeLst, raDecToAltAz } from '../../../lib/skyMath';
import { mountParticleScene, type Sky2Density, type Sky2GalaxyMode, type Sky2Scene, type Sky2Tweaks } from './particleScene';
import { alignNotableToRendered, altAzToXyz, parsePackedStars, type ParsedStars } from './starsData';
import { pickGalaxyIndex, pickStarIndex } from './hitTest';
import { ZoomControls2 } from './ZoomControls2';
import { CardinalLabels2 } from './CardinalLabels2';
import { GridLabels2 } from './GridLabels2';
import { ObjectInfoCard2 } from './ObjectInfoCard2';
import { SelectionIndicator2 } from './SelectionIndicator2';
import { TimelineBar2 } from './TimelineBar2';
import { DatePickerPopup2 } from './DatePickerPopup2';
import { VisibilityBar2, type Sky2Visibility } from './VisibilityBar2';
import { Constellations2 } from './Constellations2';
import { SearchBar2 } from './SearchBar2';
import type { Selection } from './selection';
import type { Sky2Projection } from './shaders';
import type { Constellation, Galaxy, Mode, NotableStar } from '../../../types';
import type {
  SearchHit,
  SearchIndexMsg,
} from '../../../workers/skySearch.worker';

interface LocationResponse {
  location: { lat: number; lng: number } | null;
  source: 'system' | 'manual' | 'none';
}

const INITIAL_TWEAKS: Sky2Tweaks = {
  projection: 'stereo',
  galaxyMode: 'visual',
};

const PERFORMANCE_STAR_COUNT = 4000;
const PERFORMANCE_GALAXY_COUNT = 100;

const STAR_ROW_BYTES = 5 * 4;
const DRAG_THRESHOLD_PX = 6;

interface Props {
  mode: Mode;
  palette: string;
  onOpenDocs: () => void;
}

function readCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Compute the distance-ascending permutation of a ParsedStars buffer. Stable
 * via Array.prototype.sort (ES2019), so distance ties preserve the buffer's
 * original magnitude-sorted order.
 */
function buildDistancePermutation(stars: ParsedStars): Uint32Array {
  const n = stars.count;
  const dist = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = stars.positions[i * 3 + 0];
    const y = stars.positions[i * 3 + 1];
    const z = stars.positions[i * 3 + 2];
    dist[i] = Math.sqrt(x * x + y * y + z * z);
  }
  const ix = Array.from({ length: n }, (_, i) => i);
  ix.sort((a, b) => dist[a] - dist[b]);
  return Uint32Array.from(ix);
}

function buildStarDensityMask(
  perm: Uint32Array,
  count: number,
  mode: Sky2Density,
): Uint8Array {
  const mask = new Uint8Array(count);
  if (mode === 'full') {
    mask.fill(1);
    return mask;
  }
  const keep = mode === 'balanced'
    ? Math.floor(count / 2)
    : Math.min(PERFORMANCE_STAR_COUNT, count);
  for (let i = 0; i < keep; i++) mask[perm[i]] = 1;
  return mask;
}

function buildGalaxyAngularPermutation(galaxies: Galaxy[]): Uint32Array {
  const n = galaxies.length;
  const size = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    size[i] = Math.max(galaxies[i].major_arcmin, galaxies[i].minor_arcmin);
  }
  const ix = Array.from({ length: n }, (_, i) => i);
  ix.sort((a, b) => size[b] - size[a]);
  return Uint32Array.from(ix);
}

function sliceGalaxies(
  full: Galaxy[],
  perm: Uint32Array,
  mode: Sky2Density,
): Galaxy[] {
  if (mode === 'full') return full;
  const keep = mode === 'balanced'
    ? Math.floor(full.length / 2)
    : Math.min(PERFORMANCE_GALAXY_COUNT, full.length);
  const out: Galaxy[] = new Array(keep);
  for (let i = 0; i < keep; i++) out[i] = full[perm[i]];
  return out;
}

export function SkyViewer2({ mode, palette, onOpenDocs }: Props) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<Sky2Scene | null>(null);
  const renderSetRef = useRef<ParsedStars | null>(null);
  const notableForRenderedRef = useRef<(NotableStar | null)[]>([]);
  const effectiveCountRef = useRef<number>(0);
  const starDistancePermRef = useRef<Uint32Array | null>(null);
  const starDensityMaskRef = useRef<Uint8Array | null>(null);
  const galaxiesAllRef = useRef<Galaxy[]>([]);
  const galaxyPermRef = useRef<Uint32Array | null>(null);
  const galaxiesRenderedRef = useRef<Galaxy[]>([]);

  // Latest (lstRad, latRad) pushed into the scene. The hover/click handlers
  // read this synchronously so the CPU hit-test matches the GPU's current frame.
  const astroRef = useRef<{ lstRad: number; latRad: number }>({ lstRad: 0, latRad: 0 });

  const [tweaks, setTweaks] = useState<Sky2Tweaks>(INITIAL_TWEAKS);
  const [date, setDate] = useState<Date>(() => new Date());

  // Search-as-you-type Worker. Mounted once; receives an `index` message
  // after the catalogue fetch resolves. The state surface lets SearchBar2
  // mount reactively when the worker becomes available; the parallel ref
  // lets the catalogue-fetch effect (deps: []) reach the worker no matter
  // which effect fires first.
  const [searchWorker, setSearchWorker] = useState<Worker | null>(null);
  const searchWorkerRef = useRef<Worker | null>(null);
  useEffect(() => {
    const w = new Worker(
      new URL('../../../workers/skySearch.worker.ts', import.meta.url),
      { type: 'module' },
    );
    searchWorkerRef.current = w;
    setSearchWorker(w);
    return () => {
      w.terminate();
      searchWorkerRef.current = null;
      setSearchWorker(null);
    };
  }, []);

  // NotableStar.id → render-set index, for restoring full crosshair+card
  // pipeline when the user picks a star from search results.
  const notableIdToRenderIndexRef = useRef<Map<number, number>>(new Map());
  const [constellations, setConstellations] = useState<Constellation[]>([]);
  const [vis, setVis] = useState<Sky2Visibility>({
    sun: true, moon: true,
    stars: true, galaxies: true, constellations: true,
    grid: true, horizon: true, ground: true, labels: true,
  });
  // Mirror of `vis` for closures that need the latest value (e.g. async fetch
  // resolution re-applying visibility post-load, click pipeline reading
  // galaxies-on without re-binding).
  const visRef = useRef<Sky2Visibility>({
    sun: true, moon: true,
    stars: true, galaxies: true, constellations: true,
    grid: true, horizon: true, ground: true, labels: true,
  });
  useEffect(() => { visRef.current = vis; }, [vis]);

  const [starDensity, setStarDensity] = useState<Sky2Density>('full');
  const [galaxyDensity, setGalaxyDensity] = useState<Sky2Density>('full');
  // Mirrors of the density state for the data-load effect: a user who toggles
  // density before the fetch resolves would otherwise see their choice
  // overwritten by the default-'full' apply on completion.
  const starDensityRef = useRef<Sky2Density>('full');
  const galaxyDensityRef = useRef<Sky2Density>('full');
  useEffect(() => { starDensityRef.current = starDensity; }, [starDensity]);
  useEffect(() => { galaxyDensityRef.current = galaxyDensity; }, [galaxyDensity]);

  const [skyColor, setSkyColor] = useState<boolean>(false);
  const [observer, setObserver] = useState<{ latRad: number; lonRad: number }>(
    { latRad: 0, lonRad: 0 },
  );

  const [pickerOpen, setPickerOpen] = useState<boolean>(false);
  const [liveTicking, setLiveTicking] = useState<boolean>(true);
  const [fovDisplay, setFovDisplay] = useState<number>(0);
  const [selected, setSelected] = useState<Selection | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);

  // Mount the scene once.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const scene = mountParticleScene(stage, INITIAL_TWEAKS);
    sceneRef.current = scene;
    setFovDisplay(scene.getFov());
    const unsub = scene.onFovChange((f) => setFovDisplay(f));
    return () => {
      unsub();
      scene.dispose();
      sceneRef.current = null;
      renderSetRef.current = null;
      notableForRenderedRef.current = [];
      effectiveCountRef.current = 0;
      starDistancePermRef.current = null;
      starDensityMaskRef.current = null;
      galaxiesAllRef.current = [];
      galaxyPermRef.current = null;
      galaxiesRenderedRef.current = [];
    };
  }, []);

  // Parallel-fetch the binary render set, notable metadata, constellations,
  // galaxies. Build the distance/angular permutations once on load.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchBinary(`/api/sky-viewer/stars`),
      apiFetch<NotableStar[]>(`/api/sky-viewer/stars?subset=notable`),
      apiFetch<Constellation[]>(`/api/sky-viewer/constellations`),
      apiFetch<Galaxy[]>(`/api/sky-viewer/galaxies`),
    ]).then(([buffer, notable, cons, gals]) => {
      if (cancelled) return;
      const rowCount = Math.floor(buffer.byteLength / STAR_ROW_BYTES);
      const parsed = parsePackedStars(buffer, rowCount);
      renderSetRef.current = parsed;
      effectiveCountRef.current = parsed.count;
      notableForRenderedRef.current = alignNotableToRendered(parsed, notable);
      starDistancePermRef.current = buildDistancePermutation(parsed);

      // Build NotableStar.id → render-set index for search-click selection.
      const idMap = new Map<number, number>();
      notableForRenderedRef.current.forEach((n, idx) => {
        if (n) idMap.set(n.id, idx);
      });
      notableIdToRenderIndexRef.current = idMap;

      // Hand the catalogue to the search worker.
      const idxMsg: SearchIndexMsg = { type: 'index', stars: notable, galaxies: gals };
      searchWorkerRef.current?.postMessage(idxMsg);

      const starMode = starDensityRef.current;
      const galMode  = galaxyDensityRef.current;
      starDensityMaskRef.current = buildStarDensityMask(
        starDistancePermRef.current,
        parsed.count,
        starMode,
      );

      galaxiesAllRef.current = gals;
      galaxyPermRef.current = buildGalaxyAngularPermutation(gals);
      const slicedGals = sliceGalaxies(gals, galaxyPermRef.current, galMode);
      galaxiesRenderedRef.current = slicedGals;

      sceneRef.current?.setStars(buffer, rowCount);
      sceneRef.current?.setStarDensityMask(starDensityMaskRef.current);
      sceneRef.current?.setConstellations(cons);
      setConstellations(cons);
      sceneRef.current?.setGalaxies(slicedGals);
      // Catalogue layers materialise after the visibility-mirror effect first
      // ran, so re-apply the current vis state — otherwise a user who toggled
      // a layer off pre-load sees it flash on once the fetch resolves.
      sceneRef.current?.setLayerVisible('stars', visRef.current.stars);
      sceneRef.current?.setLayerVisible('constellations', visRef.current.constellations);
      sceneRef.current?.setLayerVisible('galaxies', visRef.current.galaxies);
    }).catch((err) => {
      console.error('sky2: failed to load sky data', err);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    sceneRef.current?.setTheme(readCssVar('--bg') || '#000', readCssVar('--text') || '#ffffff');
    sceneRef.current?.setMode(mode === 'dark');
  }, [mode, palette]);

  // One-shot observer location pull. Silent on failure — observer stays (0, 0).
  useEffect(() => {
    apiFetch<LocationResponse>('/api/location').then((r) => {
      if (r.location) {
        setObserver({
          latRad: r.location.lat * Math.PI / 180,
          lonRad: r.location.lng * Math.PI / 180,
        });
      }
    }).catch(() => { /* silent */ });
  }, []);

  // Live-tick the clock once per second when in "now" mode.
  useEffect(() => {
    if (!liveTicking) return;
    const id = setInterval(() => setDate(new Date()), 1000);
    return () => clearInterval(id);
  }, [liveTicking]);

  // Mirror visibility booleans onto the scene's per-layer toggles.
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.setLayerVisible('stars', vis.stars);
    s.setLayerVisible('grid', vis.grid);
    s.setLayerVisible('horizon', vis.horizon);
    s.setLayerVisible('ground', vis.ground);
    s.setLayerVisible('constellations', vis.constellations);
    s.setLayerVisible('galaxies', vis.galaxies);
    s.setLayerVisible('sun', vis.sun);
    s.setLayerVisible('moon', vis.moon);
  }, [vis]);

  // Clear stale selections when their underlying layer goes off.
  useEffect(() => {
    if (selected?.kind === 'star' && !vis.stars) setSelected(null);
    if (selected?.kind === 'galaxy' && !vis.galaxies) setSelected(null);
  }, [vis.stars, vis.galaxies, selected]);

  // Push (lstRad, latRad) into the scene whenever `date` (or location) changes.
  useEffect(() => {
    const jd = julianDate(date);
    const lstRad = computeLst(jd, observer.lonRad);
    astroRef.current = { lstRad, latRad: observer.latRad };
    sceneRef.current?.setTime(lstRad, observer.latRad);
    sceneRef.current?.setDate(date);
  }, [date, observer]);

  // Apply star density on change. `selected` is intentionally omitted from the
  // dep list: this effect should only fire when the density mode flips, not
  // every time the user clicks a different star. The closure captures the
  // latest `selected` value at render time so the culling check stays correct.
  useEffect(() => {
    const parsed = renderSetRef.current;
    const perm = starDistancePermRef.current;
    if (!parsed || !perm) return;
    const mask = buildStarDensityMask(perm, parsed.count, starDensity);
    starDensityMaskRef.current = mask;
    sceneRef.current?.setStarDensityMask(mask);
    if (selected?.kind === 'star' && mask[selected.renderIndex] < 1) {
      setSelected(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starDensity]);

  // Apply galaxy density on change. Same closure-capture rationale as the
  // star-density effect above — `selected` deliberately not in deps.
  useEffect(() => {
    const all = galaxiesAllRef.current;
    const perm = galaxyPermRef.current;
    if (all.length === 0 || !perm) return;
    const sliced = sliceGalaxies(all, perm, galaxyDensity);
    galaxiesRenderedRef.current = sliced;
    sceneRef.current?.setGalaxies(sliced);
    // Re-apply the visibility flag — setGalaxies rebuilds the THREE object.
    sceneRef.current?.setLayerVisible('galaxies', visRef.current.galaxies);
    if (selected?.kind === 'galaxy') {
      const stillThere = sliced.some((g) => g.id === selected.galaxy.id);
      if (!stillThere) setSelected(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galaxyDensity]);

  // Apply galaxy-mode change via setTweak (existing scene plumbing).
  useEffect(() => {
    sceneRef.current?.setTweak('galaxyMode', tweaks.galaxyMode);
  }, [tweaks.galaxyMode]);

  // Apply projection change via setTweak.
  useEffect(() => {
    sceneRef.current?.setTweak('projection', tweaks.projection);
  }, [tweaks.projection]);

  // Hover + click hit-test. Listeners are wired once on mount.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    let hx = 0, hy = 0, hRafScheduled = false;
    let downX = 0, downY = 0, didDrag = false;

    const pickStarAt = (px: number, py: number): number => {
      const renderSet = renderSetRef.current;
      const scene = sceneRef.current;
      if (!renderSet || !scene) return -1;
      if (!visRef.current.stars) return -1;
      const view = scene.getView();
      const cap = effectiveCountRef.current;
      const { lstRad, latRad } = astroRef.current;
      return pickStarIndex(
        renderSet,
        {
          yaw: view.yaw, pitch: view.pitch, fovDeg: view.fovDeg,
          projMode: view.projMode,
          viewportW: stage.clientWidth, viewportH: stage.clientHeight,
        },
        px, py, cap, lstRad, latRad,
        starDensityMaskRef.current,
      );
    };

    const pickGalaxyAt = (px: number, py: number): number => {
      const scene = sceneRef.current;
      if (!scene) return -1;
      if (!visRef.current.galaxies) return -1;
      const list = galaxiesRenderedRef.current;
      if (list.length === 0) return -1;
      const view = scene.getView();
      const { lstRad, latRad } = astroRef.current;
      return pickGalaxyIndex(
        list,
        {
          yaw: view.yaw, pitch: view.pitch, fovDeg: view.fovDeg,
          projMode: view.projMode,
          viewportW: stage.clientWidth, viewportH: stage.clientHeight,
        },
        px, py, lstRad, latRad,
      );
    };

    const runHover = () => {
      hRafScheduled = false;
      sceneRef.current?.setHoverIndex(pickStarAt(hx, hy));
    };

    const onMove = (e: PointerEvent) => {
      const rect = stage.getBoundingClientRect();
      hx = e.clientX - rect.left;
      hy = e.clientY - rect.top;
      if (!hRafScheduled) {
        hRafScheduled = true;
        requestAnimationFrame(runHover);
      }
    };

    const onLeave = () => sceneRef.current?.setHoverIndex(-1);

    const onDown = (e: PointerEvent) => {
      downX = e.clientX; downY = e.clientY; didDrag = false;
      sceneRef.current?.setHoverIndex(-1);
    };

    const onMoveTrack = (e: PointerEvent) => {
      if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > DRAG_THRESHOLD_PX) {
        didDrag = true;
      }
    };

    const onClick = (e: PointerEvent) => {
      if (didDrag) return;
      const rect = stage.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      // 1. Try stars first. A hit on a star *without* NotableStar metadata
      //    (mag > 5 — no proper name / HD / BF entry) falls through to the
      //    galaxy pick rather than clearing — letting the user "click through"
      //    a dim catalogue star to a galaxy underneath.
      const sIdx = pickStarAt(cx, cy);
      if (sIdx >= 0) {
        const notable = notableForRenderedRef.current[sIdx];
        if (notable) {
          setSelected({ kind: 'star', star: notable, renderIndex: sIdx });
          return;
        }
      }

      // 2. Galaxies — visibility-gated inside pickGalaxyAt.
      const gIdx = pickGalaxyAt(cx, cy);
      if (gIdx >= 0) {
        setSelected({ kind: 'galaxy', galaxy: galaxiesRenderedRef.current[gIdx] });
        return;
      }

      // 3. Empty sky.
      setSelected(null);
    };

    // Double-click → pick at cursor, set selection (in case it changed), and
    // snap the camera so the picked object sits at screen centre. Single-click
    // selection logic above still fires first; this just adds the centering.
    const onDblClick = (e: MouseEvent) => {
      const rect = stage.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      let raRad: number;
      let decRad: number;

      const sIdx = pickStarAt(cx, cy);
      if (sIdx >= 0) {
        const notable = notableForRenderedRef.current[sIdx];
        if (!notable) return;
        raRad = notable.ra_rad;
        decRad = notable.dec_rad;
        setSelected({ kind: 'star', star: notable, renderIndex: sIdx });
      } else {
        const gIdx = pickGalaxyAt(cx, cy);
        if (gIdx < 0) return;
        const g = galaxiesRenderedRef.current[gIdx];
        raRad = g.ra_deg * Math.PI / 180;
        decRad = g.dec_deg * Math.PI / 180;
        setSelected({ kind: 'galaxy', galaxy: g });
      }

      const { lstRad, latRad } = astroRef.current;
      const { altRad, azRad } = raDecToAltAz(raRad, decRad, lstRad, latRad);
      const obs = altAzToXyz(altRad, azRad, 1);
      sceneRef.current?.centerOnObserverXyz(obs.x, obs.y, obs.z);
    };

    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMoveTrack);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerleave', onLeave);
    stage.addEventListener('pointerup', onClick);
    stage.addEventListener('dblclick', onDblClick);
    return () => {
      stage.removeEventListener('pointerdown', onDown);
      stage.removeEventListener('pointermove', onMoveTrack);
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerleave', onLeave);
      stage.removeEventListener('pointerup', onClick);
      stage.removeEventListener('dblclick', onDblClick);
    };
  }, []);

  // Window-level pointerdown: dismiss the card on outside clicks. The canvas
  // handler runs first and sets/clears as appropriate. Clicking inside the
  // card itself (to read text) does not dismiss.
  useEffect(() => {
    const onWindowDown = (e: PointerEvent) => {
      const stage = stageRef.current;
      const card = cardRef.current;
      if (!stage) return;
      const t = e.target as Node | null;
      if (!t) return;
      if (stage.contains(t)) return;       // canvas handler will set / clear
      if (card && card.contains(t)) return; // clicking inside card
      setSelected(null);
    };
    window.addEventListener('pointerdown', onWindowDown);
    return () => window.removeEventListener('pointerdown', onWindowDown);
  }, []);

  const getView = useCallback(() => sceneRef.current?.getView() ?? null, []);
  const getLstLat = useCallback(() => astroRef.current, []);

  const onProjectionChange = useCallback((p: Sky2Projection) => {
    if (p === tweaks.projection) return;
    setTweaks((prev) => ({ ...prev, projection: p }));
  }, [tweaks.projection]);

  const onGalaxyModeChange = useCallback((m: Sky2GalaxyMode) => {
    if (m === tweaks.galaxyMode) return;
    setTweaks((prev) => ({ ...prev, galaxyMode: m }));
  }, [tweaks.galaxyMode]);

  const onStarDensityChange = useCallback((d: Sky2Density) => {
    if (d === starDensity) return;
    setStarDensity(d);
  }, [starDensity]);

  const onGalaxyDensityChange = useCallback((d: Sky2Density) => {
    if (d === galaxyDensity) return;
    setGalaxyDensity(d);
  }, [galaxyDensity]);

  const onSearchPick = useCallback((hit: SearchHit) => {
    const { lstRad, latRad } = astroRef.current;
    if (hit.kind === 'star') {
      const idx = notableIdToRenderIndexRef.current.get(hit.star.id);
      setSelected(
        idx != null
          ? { kind: 'star', star: hit.star, renderIndex: idx }
          : null,
      );
      const { altRad, azRad } = raDecToAltAz(
        hit.star.ra_rad, hit.star.dec_rad, lstRad, latRad,
      );
      const p = altAzToXyz(altRad, azRad, 1);
      sceneRef.current?.centerOnObserverXyz(p.x, p.y, p.z);
    } else {
      setSelected({ kind: 'galaxy', galaxy: hit.galaxy });
      const raRad = (hit.galaxy.ra_deg * Math.PI) / 180;
      const decRad = (hit.galaxy.dec_deg * Math.PI) / 180;
      const { altRad, azRad } = raDecToAltAz(raRad, decRad, lstRad, latRad);
      const p = altAzToXyz(altRad, azRad, 1);
      sceneRef.current?.centerOnObserverXyz(p.x, p.y, p.z);
    }
  }, []);

  return (
    <div className="sky2-root">
      <div ref={stageRef} className="sky2-stage" />

      <CardinalLabels2 wrapRef={stageRef} getView={getView} />
      <GridLabels2 wrapRef={stageRef} getView={getView} show={vis.labels} fovDeg={fovDisplay} />
      <Constellations2
        wrapRef={stageRef}
        getView={getView}
        getLstLat={getLstLat}
        constellations={constellations}
        show={vis.labels && vis.constellations}
      />

      <ObjectInfoCard2
        ref={cardRef}
        selection={selected}
        lstRad={astroRef.current.lstRad}
        latRad={astroRef.current.latRad}
      />

      <SelectionIndicator2
        selection={selected}
        wrapRef={stageRef}
        getView={getView}
        getLstLat={getLstLat}
      />

      <div className="sky2-topbar-right">
        {searchWorker && (
          <SearchBar2
            worker={searchWorker}
            starsVisible={vis.stars}
            galaxiesVisible={vis.galaxies}
            onPick={onSearchPick}
          />
        )}
        <VisibilityBar2
          projection={tweaks.projection}
          onProjectionChange={onProjectionChange}
          starDensity={starDensity}
          onStarDensityChange={onStarDensityChange}
          galaxyDensity={galaxyDensity}
          onGalaxyDensityChange={onGalaxyDensityChange}
          galaxyMode={tweaks.galaxyMode}
          onGalaxyModeChange={onGalaxyModeChange}
          skyColor={skyColor}
          onSkyColorChange={setSkyColor}
          vis={vis}
          onVisToggle={(k) => setVis((p) => ({ ...p, [k]: !p[k] }))}
        />
      </div>

      <TimelineBar2
        date={date}
        liveTicking={liveTicking}
        latRad={observer.latRad}
        lonRad={observer.lonRad}
        onDateChange={setDate}
        onSetLive={setLiveTicking}
        onOpenPicker={() => setPickerOpen(true)}
      />

      <DatePickerPopup2
        open={pickerOpen}
        date={date}
        onApply={(d) => { setDate(d); setLiveTicking(false); }}
        onClose={() => setPickerOpen(false)}
      />

      <ZoomControls2
        fov={fovDisplay}
        onZoomIn={() => sceneRef.current?.zoomStep(-1)}
        onZoomOut={() => sceneRef.current?.zoomStep(1)}
        onRecenter={() => sceneRef.current?.recenter()}
      />

      <button
        type="button"
        className="sky2-docs-btn"
        onClick={onOpenDocs}
        aria-label={STRINGS.SIDEBAR.DOCS_ARIA}
      >
        <Icon name="info" size={18}/>
      </button>
    </div>
  );
}

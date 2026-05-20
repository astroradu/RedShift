// HUD layout ported verbatim from temp/sky-viewer.jsx (.sky-hud + .sh-* set).
// Same element sizes, typography, scrubber height, handle dimensions, and
// pill-rounded geometry as the Claude Design reference.
//
// Additions vs Claude Design:
//   - Day-night gradient strip on the track via inline `backgroundImage`
//     (skyColorsFor + sunAltDeg, location-aware).
//   - Single midnight anchor replaced by up to two anchors marking the begin
//     and end of astronomical night (sun < -18°) for the selected calendar
//     day. Either can be absent at polar latitudes.

import { useEffect, useMemo, useRef } from 'react';
import { Icon } from '../../icons/Icon';
import { STRINGS } from '../../../lib/strings';
import { analyzeDay } from './skyGradient';
import {
  julianDate,
  moonRaDec,
  moonLitPath,
  phaseName,
  moonAltDeg,
} from '../../../lib/skyMath';

interface Props {
  date: Date;
  liveTicking: boolean;
  latRad: number;
  lonRad: number;
  onDateChange: (d: Date) => void;
  onSetLive: (live: boolean) => void;
  onOpenPicker: () => void;
}

// Midnight at center of the bar: hour=0 → 0.5, hour=12 → 0.0, hour=23.99 → ~1.0.
function timeOfDayToPct(d: Date): number {
  const h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  return ((h - 12 + 24) % 24) / 24;
}

function pctToHour(pct: number): number {
  return (pct * 24 + 12) % 24;
}

function isDayAtHour(h: number): boolean { return h >= 6 && h < 18; }

export function TimelineBar2({
  date, liveTicking, latRad, lonRad,
  onDateChange, onSetLive, onOpenPicker,
}: Props) {
  const S = STRINGS.SKY2;
  const trackRef = useRef<HTMLDivElement | null>(null);

  // Refs so the pointer-listener effect can wire once on mount and not
  // re-bind on every 1s live-tick of `date`.
  const dateRef = useRef(date);
  useEffect(() => { dateRef.current = date; }, [date]);
  const onDateChangeRef = useRef(onDateChange);
  useEffect(() => { onDateChangeRef.current = onDateChange; }, [onDateChange]);
  const onSetLiveRef = useRef(onSetLive);
  useEffect(() => { onSetLiveRef.current = onSetLive; }, [onSetLive]);

  const pct = timeOfDayToPct(date);
  const isDay = isDayAtHour(date.getHours());

  // Keyed by the calendar day + location — gradient and night window only
  // change when the day or the observer location does, NOT every live-tick.
  const dayKey = date.toDateString();
  const { gradient: hudGradient, night, moon } = useMemo(
    () => analyzeDay(date, latRad, lonRad),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayKey, latRad, lonRad],
  );

  // Live moon (phase + altitude) for the right-hand chip. Truncated to the
  // minute so the per-second `date` tick doesn't re-run Meeus.
  const liveMoon = useMemo(() => {
    const d = new Date(date);
    d.setSeconds(0, 0);
    const m = moonRaDec(julianDate(d));
    return { ...m, altDeg: moonAltDeg(d, latRad, lonRad) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(date.getTime() / 60_000), latRad, lonRad]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let dragging = false;
    const handleEvent = (e: PointerEvent) => {
      const rect = track.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const newPct = x / rect.width;
      const h = pctToHour(newPct);
      // Snap-to-minute on scrub — keeps the live-tick interval from
      // re-resolving the same instant within the same minute.
      const next = new Date(dateRef.current);
      next.setHours(Math.floor(h));
      next.setMinutes(Math.floor((h - Math.floor(h)) * 60));
      next.setSeconds(0);
      onDateChangeRef.current(next);
    };
    const onDown = (e: PointerEvent) => {
      dragging = true;
      onSetLiveRef.current(false);
      handleEvent(e);
    };
    const onMove = (e: PointerEvent) => { if (dragging) handleEvent(e); };
    const onUp = () => { dragging = false; };
    track.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      track.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  const shiftDay = (days: number) => {
    onSetLive(false);
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    onDateChange(next);
  };
  const goToday = () => {
    onDateChange(new Date());
    onSetLive(true);
  };

  return (
    <div className="sky2-hud">
      <button
        type="button"
        className="sky2-sh-time"
        onClick={onOpenPicker}
        title={S.TIMELINE_PICK_DATE}
      >
        <span className="sky2-sh-time-icon"><Icon name="calendar" size={15} /></span>
        <span className="sky2-sh-time-text">
          <span className="sky2-sh-time-date">
            {date.toLocaleString('en-US', { weekday: 'short', month: 'short', day: '2-digit' })}
          </span>
          <span className="sky2-sh-time-clock">
            {date.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </span>
        </span>
      </button>

      <div className="sky2-sh-scrubber">
        <div
          className="sky2-sh-track"
          ref={trackRef}
          style={{ backgroundImage: hudGradient }}
        >
          {/* Moon visibility ribbon — silver curve above the day/night band. */}
          <svg
            className="sky2-sh-moon-ribbon"
            viewBox="0 0 100 24"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="sky2-sh-moon-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%"   stopColor="rgba(220,228,245,0.62)"/>
                <stop offset="60%"  stopColor="rgba(190,205,230,0.30)"/>
                <stop offset="100%" stopColor="rgba(190,205,230,0.05)"/>
              </linearGradient>
            </defs>
            {moon.fillPath && (
              <path d={moon.fillPath} fill="url(#sky2-sh-moon-fill)" />
            )}
            {moon.linePath && (
              <path
                d={moon.linePath}
                fill="none"
                stroke="rgba(232,238,252,0.85)"
                strokeWidth="0.6"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
          {moon.events.map((ev, i) => (
            <span
              key={i}
              className={`sky2-sh-moon-event ${ev.kind}`}
              style={{ left: `${ev.pct * 100}%` }}
              title={ev.kind === 'rise' ? S.MOON_RISE : S.MOON_SET}
            >
              <svg viewBox="-6 -6 12 12" width="10" height="10" aria-hidden="true">
                <circle cx="0" cy="0" r="4.6" fill="#1a1d28" />
                <path d={moonLitPath(moon.phaseRep, 4.6)} fill="#E4EAF6" />
              </svg>
            </span>
          ))}

          {/* Astronomical-night anchors. 0, 1, or 2 depending on the day. */}
          {night.beginPct != null && (
            <span className="sky2-sh-anchor" style={{ left: `${night.beginPct * 100}%` }} />
          )}
          {night.endPct != null && (
            <span className="sky2-sh-anchor" style={{ left: `${night.endPct * 100}%` }} />
          )}
          <span className="sky2-sh-handle" style={{ left: `${pct * 100}%` }}>
            <span className={'sky2-sh-handle-glyph ' + (isDay ? 'day' : 'night')}>
              {isDay ? (
                <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
                  <circle cx="8" cy="8" r="3" fill="currentColor" />
                  {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
                    <rect key={a} x="7.4" y="1.5" width="1.2" height="2.6" rx="0.6"
                      fill="currentColor" transform={`rotate(${a} 8 8)`} />
                  ))}
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
                  <path
                    d="M8 1.4 L9.78 5.98 L14.7 6.34 L10.92 9.5 L12.13 14.3 L8 11.7 L3.87 14.3 L5.08 9.5 L1.3 6.34 L6.22 5.98 Z"
                    fill="currentColor"
                  />
                </svg>
              )}
            </span>
          </span>
        </div>
      </div>

      <div className="sky2-sh-controls">
        <button className="sky2-sh-icon-btn" onClick={() => shiftDay(-1)}>{S.TIMELINE_PREV_DAY}</button>
        <button
          className={'sky2-sh-now' + (liveTicking ? ' active' : '')}
          onClick={goToday}
        >{S.TIMELINE_TODAY}</button>
        <button className="sky2-sh-icon-btn" onClick={() => shiftDay(1)}>{S.TIMELINE_NEXT_DAY}</button>
      </div>

      <div className="sky2-sh-moon-chip" title={S.MOON_PHASE}>
        <span className="sky2-sh-moon-disc" aria-hidden="true">
          <svg viewBox="-12 -12 24 24" width="22" height="22">
            <defs>
              <radialGradient id="sky2-sh-moon-lit" cx="0.4" cy="0.4" r="0.7">
                <stop offset="0%"   stopColor="#FBFCFE" />
                <stop offset="55%"  stopColor="#E4E8F2" />
                <stop offset="100%" stopColor="#B6BDD0" />
              </radialGradient>
            </defs>
            <circle cx="0" cy="0" r="10" fill="#1a1c25" />
            <path d={moonLitPath(liveMoon.phaseFrac, 10)} fill="url(#sky2-sh-moon-lit)" />
            <circle cx="0" cy="0" r="10" fill="none"
                    stroke="rgba(255,255,255,0.10)" strokeWidth="0.6" />
          </svg>
        </span>
        <span className="sky2-sh-moon-text">
          <span className="sky2-sh-moon-name">{phaseName(liveMoon.phaseFrac)}</span>
          <span className="sky2-sh-moon-meta">
            {Math.round(liveMoon.illumination * 100)}%
            <span className="sky2-sh-moon-sep">·</span>
            ALT&nbsp;{liveMoon.altDeg >= 0 ? '+' : ''}{Math.round(liveMoon.altDeg)}°
          </span>
        </span>
      </div>
    </div>
  );
}

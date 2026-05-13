import { useRef } from 'react';

interface SnapSliderProps {
  /** Currently selected snap index (0..tickLabels.length - 1). */
  snap: number;
  /** Fired when the user drags or clicks to a new snap. */
  onChange: (snap: number) => void;
  /** One label per snap stop — also drives the number of stops. */
  tickLabels: readonly string[];
  /** Eyebrow text shown left of the value (e.g. "Computation Precision"). */
  label: string;
  /** Right-aligned current-value text (e.g. "High · 7×7"). */
  valueText: string;
  /** Accessibility label for the slider widget. */
  ariaLabel: string;
}

/**
 * Generic snap slider used by ComplexitySlider (5 stops) and
 * GalaxyComplexitySlider (3 stops).
 *
 * The slider is purely presentational — value mapping and labels are owned by
 * the consumer. The 3-stop variant gets the `cb-ticks-3` modifier
 * automatically when `tickLabels.length === 3`.
 */
export function SnapSlider({ snap, onChange, tickLabels, label, valueText, ariaLabel }: SnapSliderProps) {
  const ref = useRef<HTMLDivElement>(null);
  const lastSnapRef = useRef(snap);
  lastSnapRef.current = snap;

  const stops = tickLabels.length;

  const updateFromX = (clientX: number) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const next = Math.round(ratio * (stops - 1));
    if (next !== lastSnapRef.current) onChange(next);
  };

  const handleDown = (e: React.MouseEvent<HTMLDivElement>) => {
    updateFromX(e.clientX);
    const onMove = (ev: MouseEvent) => updateFromX(ev.clientX);
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const pct = (snap / (stops - 1)) * 100;

  return (
    <div className="complexity-block">
      <div className="cb-row">
        <span className="cb-label">{label}</span>
        <span className="cb-value">{valueText}</span>
      </div>
      <div
        className="cb-track"
        ref={ref}
        onMouseDown={handleDown}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={stops - 1}
        aria-valuenow={snap}
        aria-label={ariaLabel}
      >
        <div className="cb-fill" style={{ width: pct + '%' }} />
        {tickLabels.map((tickLabel, i) => (
          <button
            key={i}
            type="button"
            tabIndex={-1}
            className={'cb-dot' + (i === snap ? ' on' : '') + (i < snap ? ' filled' : '')}
            style={{ left: `${(i / (stops - 1)) * 100}%` }}
            onClick={(e) => { e.stopPropagation(); onChange(i); }}
            aria-label={tickLabel}
          />
        ))}
        <div className="cb-knob" style={{ left: pct + '%' }} />
      </div>
      <div className={'cb-ticks' + (stops === 3 ? ' cb-ticks-3' : '')}>
        {tickLabels.map((tickLabel, i) => (
          <span key={tickLabel} className={i === snap ? 'on' : ''}>{tickLabel}</span>
        ))}
      </div>
    </div>
  );
}

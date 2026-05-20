import { Icon } from '../../icons/Icon';
import { STRINGS } from '../../../lib/strings';

interface Props {
  hour: number;
  minute: number;
  onHourChange: (h: number) => void;
  onMinuteChange: (m: number) => void;
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function clamp(v: number, lo: number, hi: number): number {
  if (Number.isNaN(v)) return lo;
  return Math.max(lo, Math.min(hi, Math.trunc(v)));
}

export function TimePickerStepper2({ hour, minute, onHourChange, onMinuteChange }: Props) {
  const S = STRINGS.SKY2;

  const bumpHour = (delta: number) => onHourChange(clamp(hour + delta, 0, 23));
  const bumpMin = (delta: number) => onMinuteChange(clamp(minute + delta, 0, 59));

  return (
    <div className="dp-time-stepper">
      <div className="dp-ts-field">
        <button
          type="button"
          className="dp-ts-btn"
          aria-label={`${S.DP_TIME_STEP_UP} ${S.DP_TIME_HOUR_ARIA}`}
          onClick={() => bumpHour(1)}
        >
          <Icon name="chevron-up" size={11} />
        </button>
        <input
          type="number"
          className="dp-ts-input"
          aria-label={S.DP_TIME_HOUR_ARIA}
          min={0}
          max={23}
          step={1}
          value={pad2(hour)}
          onChange={(e) => onHourChange(clamp(parseInt(e.target.value, 10), 0, 23))}
        />
        <button
          type="button"
          className="dp-ts-btn"
          aria-label={`${S.DP_TIME_STEP_DOWN} ${S.DP_TIME_HOUR_ARIA}`}
          onClick={() => bumpHour(-1)}
        >
          <Icon name="chevron-down" size={11} />
        </button>
      </div>

      <span className="dp-ts-sep">:</span>

      <div className="dp-ts-field">
        <button
          type="button"
          className="dp-ts-btn"
          aria-label={`${S.DP_TIME_STEP_UP} ${S.DP_TIME_MIN_ARIA}`}
          onClick={() => bumpMin(5)}
        >
          <Icon name="chevron-up" size={11} />
        </button>
        <input
          type="number"
          className="dp-ts-input"
          aria-label={S.DP_TIME_MIN_ARIA}
          min={0}
          max={59}
          step={1}
          value={pad2(minute)}
          onChange={(e) => onMinuteChange(clamp(parseInt(e.target.value, 10), 0, 59))}
        />
        <button
          type="button"
          className="dp-ts-btn"
          aria-label={`${S.DP_TIME_STEP_DOWN} ${S.DP_TIME_MIN_ARIA}`}
          onClick={() => bumpMin(-5)}
        >
          <Icon name="chevron-down" size={11} />
        </button>
      </div>
    </div>
  );
}

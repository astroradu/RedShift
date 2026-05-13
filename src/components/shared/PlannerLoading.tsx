import { Icon } from '../icons/Icon';

interface PlannerLoadingProps {
  /** Steps shown in the right-side status list. */
  statuses: readonly string[];
  /** Index of the active step (0-based). Steps before it render as `done`. */
  statusIndex: number;
  /** Free-form status line shown above the steps (e.g. "Computing altitudes…"). */
  statusText: string;
  /** Overall completion percent (0–100). */
  percent: number;
  /** Eyebrow label naming the running engine — e.g. `RUNNING · constellation_scorer.py`. */
  eyebrow: string;
}

/**
 * Shared loading screen for both planners (constellation + galaxy).
 *
 * Renders the circular progress ring, the per-step status list, and the
 * bottom progress bar. The host component decides which step list and
 * eyebrow text to pass in.
 */
export function PlannerLoading({ statuses, statusIndex, statusText, percent, eyebrow }: PlannerLoadingProps) {
  return (
    <div className="planner-loading fade-enter fade-in">
      <div className="loader-ring">
        <svg viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="52" stroke="var(--hairline-strong)" strokeWidth="1" fill="none"/>
          <circle
            cx="60" cy="60" r="52"
            stroke="var(--accent)" strokeWidth="1.5" fill="none"
            strokeDasharray={`${(percent / 100) * 326.7} 326.7`}
            strokeLinecap="round"
            transform="rotate(-90 60 60)"
          />
        </svg>
        <div className="loader-percent">
          <span className="lp-num">{Math.round(percent)}</span>
          <span className="lp-pct">%</span>
        </div>
      </div>
      <div className="loader-status">
        <div className="ls-eyebrow">{eyebrow}</div>
        <div className="ls-line">{statusText}…</div>
        <div className="ls-steps">
          {statuses.map((s, i) => (
            <div
              key={i}
              className={'ls-step' + (i < statusIndex ? ' done' : '') + (i === statusIndex ? ' active' : '')}
            >
              <span className="ls-bullet">
                {i < statusIndex ? <Icon name="check" size={11}/> : <span className="ls-dot"/>}
              </span>
              <span>{s}</span>
            </div>
          ))}
        </div>
        <div className="ls-bar"><i style={{ width: percent + '%' }}/></div>
      </div>
    </div>
  );
}

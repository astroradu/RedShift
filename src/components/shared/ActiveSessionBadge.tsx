import { Icon } from '../icons/Icon';
import { STRINGS } from '../../lib/strings';

interface ActiveSessionBadgeProps {
  onJump: () => void;
  onClear: () => void;
}

export function ActiveSessionBadge({ onJump, onClear }: ActiveSessionBadgeProps) {
  return (
    <div className="active-session-badge" role="group" aria-label={STRINGS.PLANNER.ACTIVE_SESSION}>
      <button
        type="button"
        className="asb-label"
        onClick={onJump}
        aria-label={STRINGS.PLANNER.ACTIVE_SESSION_JUMP_ARIA}
      >
        <span className="asb-dot" aria-hidden="true" />
        {STRINGS.PLANNER.ACTIVE_SESSION}
      </button>
      <button
        type="button"
        className="asb-clear"
        onClick={onClear}
        aria-label={STRINGS.PLANNER.ACTIVE_SESSION_CLEAR_ARIA}
      >
        <Icon name="x" size={12} />
      </button>
    </div>
  );
}

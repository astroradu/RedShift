import { ReactNode } from 'react';
import { Icon } from '../icons/Icon';

interface PanelHeaderProps {
  title: string;
  subtitle: string;
  onBack?: () => void;
  capitalize?: boolean;
  rightSlot?: ReactNode;
}

export function PanelHeader({ title, subtitle, onBack, capitalize, rightSlot }: PanelHeaderProps) {
  return (
    <div className="panel-head">
      <div className="ph-left">
        {onBack && (
          <button className="btn ghost back-btn" onClick={onBack}>
            <Icon name="arrow-left" size={12} /> Back
          </button>
        )}
        <div>
          <h2 className="ph-title" style={capitalize ? { textTransform: 'capitalize' } : undefined}>
            {title}
          </h2>
          <div className="ph-sub">{subtitle}</div>
        </div>
      </div>
      {rightSlot && <div className="ph-right">{rightSlot}</div>}
    </div>
  );
}

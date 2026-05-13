import { BrandMark } from '../brand/BrandMark';
import { Icon } from '../icons/Icon';
import { ThemeToggle } from './ThemeToggle';
import { NotificationTray } from './NotificationTray';
import type { Feature, Mode, View } from '../../types';
import { STRINGS } from '../../lib/strings';

interface TopBarProps {
  theme: Mode;
  setTheme: (mode: Mode) => void;
  view: View;
  feature: Feature | null;
  onHome: () => void;
  onSettings: () => void;
}

export function TopBar({ theme, setTheme, view, feature, onHome, onSettings }: TopBarProps) {
  return (
    <div className="topbar">
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span className="brand">
          <span className="brand-mark"><BrandMark size={22}/></span>
          <span className="brand-text"><span className="bt-red">Red</span><span className="bt-shift">Shift</span></span>
        </span>
        {(view === 'detail' || view === 'settings') && (
          <button className="crumb" onClick={onHome}>
            <Icon name="arrow-left" size={12}/> {STRINGS.TOPBAR.HOME}
          </button>
        )}
      </div>
      <div className="feature-title">
        {view === 'detail' ? (
          <><span className="dot"/> {feature?.name}</>
        ) : view === 'settings' ? (
          <><span className="dot"/> {STRINGS.TOPBAR.SETTINGS}</>
        ) : (
          <span className="topbar-version">{STRINGS.TOPBAR.VERSION}</span>
        )}
      </div>
      <div className="topbar-right">
        <NotificationTray/>
        <ThemeToggle theme={theme} setTheme={setTheme}/>
        <button className="icon-btn" aria-label={STRINGS.TOPBAR.SETTINGS_ARIA} onClick={onSettings}>
          <Icon name="settings" size={14}/>
        </button>
      </div>
    </div>
  );
}

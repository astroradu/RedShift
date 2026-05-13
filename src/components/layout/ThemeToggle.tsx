import { Icon } from '../icons/Icon';
import type { Mode } from '../../types';
import { STRINGS } from '../../lib/strings';

interface ThemeToggleProps {
  theme: Mode;
  setTheme: (mode: Mode) => void;
}

export function ThemeToggle({ theme, setTheme }: ThemeToggleProps) {
  return (
    <div className="theme-toggle" role="group" aria-label={STRINGS.THEME_TOGGLE.GROUP_ARIA} data-mode={theme}>
      <span className="pill" aria-hidden="true"/>
      <button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')} aria-label={STRINGS.THEME_TOGGLE.DARK}>
        <Icon name="moon" size={14}/>
      </button>
      <button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')} aria-label={STRINGS.THEME_TOGGLE.LIGHT}>
        <Icon name="sun" size={14}/>
      </button>
    </div>
  );
}

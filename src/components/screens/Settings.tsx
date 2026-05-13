import { Icon } from '../icons/Icon';
import { usePalettes } from '../../hooks/usePalettes';
import { LocationSection } from '../features/settings/LocationSection';
import type { Palette, Mode } from '../../types';
import { STRINGS } from '../../lib/strings';

interface SettingsProps {
  mode: Mode;
  setMode: (mode: Mode) => void;
  palette: string;
  setPalette: (id: string) => void;
  onClose: () => void;
}

interface SwatchPreviewProps {
  p: Palette;
  m: Mode;
  active: boolean;
  onSelect: (paletteId: string, mode: Mode) => void;
}

function SwatchPreview({ p, m, active, onSelect }: SwatchPreviewProps) {
  const v = p[m];
  return (
    <div
      className={'swatch-card' + (active ? ' active' : '')}
      onClick={() => onSelect(p.id, m)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onSelect(p.id, m)}
    >
      <div className="swatch-preview" style={{ background: v['--bg'], color: v['--text'], borderColor: v['--hairline-strong'] }}>
        <div className="sp-card" style={{ background: v['--surface'], borderColor: v['--hairline'] }}>
          <div className="sp-line" style={{ background: v['--text'], opacity: 0.85 }}/>
          <div className="sp-line short" style={{ background: v['--muted'] }}/>
          <div className="sp-dots">
            <span style={{ background: v['--accent'], boxShadow: `0 0 10px ${v['--glow']}` }}/>
            <span style={{ background: v['--accent-2'] }}/>
            <span style={{ background: v['--muted'] }}/>
          </div>
        </div>
        <div className="sp-bar" style={{ background: `linear-gradient(90deg, ${v['--accent']}, ${v['--accent-2']})` }}/>
      </div>
      <div className="swatch-meta">
        <div className="sm-row">
          <span className="sm-name">{p.name}</span>
          <span className="sm-mode">{STRINGS.SETTINGS.modeLabel(m)}</span>
        </div>
        <div className="sm-desc">{p.desc}</div>
        <div className="sm-chips">
          <span style={{ background: v['--accent'] }}/>
          <span style={{ background: v['--accent-2'] }}/>
          <span style={{ background: v['--surface'], border: `1px solid ${v['--hairline-strong']}` }}/>
          <span style={{ background: v['--text'] }}/>
        </div>
      </div>
      {active && <span className="swatch-check"><Icon name="check" size={12}/></span>}
    </div>
  );
}

export function Settings({ mode, setMode, palette, setPalette, onClose }: SettingsProps) {
  const { palettes } = usePalettes();
  const handleSelect = (paletteId: string, m: Mode) => {
    setPalette(paletteId);
    setMode(m);
  };

  return (
    <div className="settings-screen fade-enter fade-in">
      <div className="settings-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button className="btn ghost back-btn" onClick={onClose}>
            <Icon name="arrow-left" size={12}/> {STRINGS.SETTINGS.BACK}
          </button>
          <div>
            <h2 className="settings-title">{STRINGS.SETTINGS.TITLE}</h2>
            <div className="settings-sub">{STRINGS.SETTINGS.SUBTITLE}</div>
          </div>
        </div>
      </div>

      <div className="settings-body">
        <section className="settings-section">
          <div className="ss-head">
            <span className="ss-eyebrow">{STRINGS.SETTINGS.SECTION_LOCATION_EYEBROW}</span>
            <h3 className="ss-title">{STRINGS.SETTINGS.SECTION_LOCATION_TITLE}</h3>
            <p className="ss-desc">{STRINGS.SETTINGS.SECTION_LOCATION_DESC}</p>
          </div>
          <div className="ss-body">
            <LocationSection/>
          </div>
        </section>

        <section className="settings-section">
          <div className="ss-head">
            <span className="ss-eyebrow">{STRINGS.SETTINGS.SECTION_APPEARANCE_EYEBROW}</span>
            <h3 className="ss-title">{STRINGS.SETTINGS.SECTION_APPEARANCE_TITLE}</h3>
            <p className="ss-desc">{STRINGS.SETTINGS.SECTION_APPEARANCE_DESC}</p>
          </div>
          <div className="ss-body">
            <div className="mode-row">
              <button className={'mode-card' + (mode === 'dark' ? ' on' : '')} onClick={() => setMode('dark')}>
                <div className="mode-preview dark">
                  <span className="mp-moon"><Icon name="moon" size={20}/></span>
                </div>
                <div className="mode-label">{STRINGS.SETTINGS.MODE_DARK_LABEL}</div>
                <div className="mode-sub">{STRINGS.SETTINGS.MODE_DARK_SUB}</div>
              </button>
              <button className={'mode-card' + (mode === 'light' ? ' on' : '')} onClick={() => setMode('light')}>
                <div className="mode-preview light">
                  <span className="mp-sun"><Icon name="sun" size={20}/></span>
                </div>
                <div className="mode-label">{STRINGS.SETTINGS.MODE_LIGHT_LABEL}</div>
                <div className="mode-sub">{STRINGS.SETTINGS.MODE_LIGHT_SUB}</div>
              </button>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <div className="ss-head">
            <span className="ss-eyebrow">{STRINGS.SETTINGS.SECTION_PALETTE_EYEBROW}</span>
            <h3 className="ss-title">{STRINGS.SETTINGS.SECTION_PALETTE_TITLE}</h3>
            <p className="ss-desc">{STRINGS.SETTINGS.SECTION_PALETTE_DESC}</p>
          </div>
          <div className="ss-body">
            <div className="swatch-grid">
              {palettes.map(p => (
                <SwatchPreview
                  key={p.id}
                  p={p}
                  m={mode}
                  active={palette === p.id}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}

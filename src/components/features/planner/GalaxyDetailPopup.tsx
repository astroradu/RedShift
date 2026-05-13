import { Icon } from '../../icons/Icon';
import { PopupShell } from '../../shared/PopupShell';
import type { GalaxyRow } from '../../../types';
import { STRINGS } from '../../../lib/strings';

const POPUP_ID = 'galaxy-detail';

interface GalaxyDetailPopupProps {
  row: GalaxyRow;
  months: string[];
  onClose: () => void;
}

interface FieldGroup {
  title: string;
  items: { label: string; value: string }[];
}

/**
 * Group raw CSV columns into UX-friendly sections so the popup reads like a
 * gallery card rather than a CSV dump. Unknown columns fall through into the
 * "More" group so nothing gets dropped silently.
 */
function buildFieldGroups(row: GalaxyRow): FieldGroup[] {
  const m = row.metadata;
  const get = (k: string): string => (m[k] ?? '').trim();

  const S = STRINGS.GALAXY_DETAIL;
  const identity: FieldGroup['items'] = [];
  if (get('objname')) identity.push({ label: S.FIELD_PRIMARY_NAME, value: get('objname') });
  if (get('objtype')) identity.push({ label: S.FIELD_OBJECT_TYPE, value: get('objtype') });
  identity.push({ label: S.FIELD_PGC_ID, value: row.pgc });
  if (get('alt_names')) {
    identity.push({ label: S.FIELD_ALIASES, value: get('alt_names').split(',').map(s => s.trim()).join(', ') });
  }

  const coords: FieldGroup['items'] = [];
  if (get('ra_readable')) coords.push({ label: S.FIELD_RA, value: get('ra_readable') });
  else if (get('ra_deg')) coords.push({ label: S.FIELD_RA, value: `${get('ra_deg')}°` });
  if (get('dec_readable')) coords.push({ label: S.FIELD_DEC, value: get('dec_readable') });
  else if (get('dec_deg')) coords.push({ label: S.FIELD_DEC, value: `${get('dec_deg')}°` });

  const morphology: FieldGroup['items'] = [];
  if (get('major_arcmin')) morphology.push({ label: S.FIELD_MAJOR, value: `${get('major_arcmin')}'` });
  if (get('minor_arcmin')) morphology.push({ label: S.FIELD_MINOR, value: `${get('minor_arcmin')}'` });
  if (get('axis_ratio_a_over_b')) morphology.push({ label: S.FIELD_RATIO, value: get('axis_ratio_a_over_b') });

  const photometry: FieldGroup['items'] = [];
  if (get('bt_mag')) photometry.push({ label: S.FIELD_BT, value: get('bt_mag') });
  if (get('vt_mag')) photometry.push({ label: S.FIELD_VT, value: get('vt_mag') });

  const distance: FieldGroup['items'] = [];
  if (get('modbest')) distance.push({ label: S.FIELD_MODULUS, value: get('modbest') });
  if (get('e_modbest')) distance.push({ label: S.FIELD_MOD_ERR, value: `± ${get('e_modbest')}` });
  if (get('distance_mly')) distance.push({ label: S.FIELD_DISTANCE, value: `${get('distance_mly')} Mly` });

  const knownKeys = new Set([
    'objname', 'objtype', 'alt_names',
    'ra_readable', 'ra_deg', 'dec_readable', 'dec_deg',
    'major_arcmin', 'minor_arcmin', 'axis_ratio_a_over_b',
    'bt_mag', 'vt_mag',
    'modbest', 'e_modbest', 'distance_mly',
  ]);
  const more: FieldGroup['items'] = Object.entries(m)
    .filter(([k, v]) => !knownKeys.has(k) && v.trim() !== '')
    .map(([k, v]) => ({ label: k, value: v }));

  const groups: FieldGroup[] = [];
  if (identity.length)   groups.push({ title: S.GROUP_IDENTITY,   items: identity });
  if (coords.length)     groups.push({ title: S.GROUP_COORDS,     items: coords });
  if (morphology.length) groups.push({ title: S.GROUP_MORPHOLOGY, items: morphology });
  if (photometry.length) groups.push({ title: S.GROUP_PHOTOMETRY, items: photometry });
  if (distance.length)   groups.push({ title: S.GROUP_DISTANCE,   items: distance });
  if (more.length)       groups.push({ title: S.GROUP_MORE,       items: more });
  return groups;
}

interface GalaxyPalette {
  core: string;
  accent: string;
}

const GALAXY_PALETTES: readonly GalaxyPalette[] = [
  { core: '#ece4d2', accent: '#c8bfae' },  // warm white — giant elliptical
  { core: '#e08840', accent: '#b86220' },  // muted amber-orange — warm spiral
  { core: '#5080d8', accent: '#3058a8' },  // soft cobalt blue — compact blue
  { core: '#c8a030', accent: '#987818' },  // antique gold — lenticular
  { core: '#90b4e8', accent: '#5878c0' },  // pale steel blue — blue elliptical
  { core: '#c87068', accent: '#9c4848' },  // dusty coral — interacting pair
  { core: '#8858c8', accent: '#6038a0' },  // muted violet — Seyfert
  { core: '#38a090', accent: '#187060' },  // teal-cyan — irregular/starburst
] as const;

interface GalaxyVisualProps {
  major: number;
  minor: number;
  ratio: number;
}

function GalaxyVisual({ major, minor, ratio }: GalaxyVisualProps) {
  const safeRatio = ratio > 0 && Number.isFinite(ratio) ? ratio : (major > 0 && minor > 0 ? major / minor : 1.6);
  const aspect = Math.max(1.0, Math.min(4.5, safeRatio));
  const rx = 92;
  const ry = rx / aspect;
  const seed = (major * 31 + minor * 17) || 1;
  const tilt = ((seed * 137) % 60) - 30;
  const palette = GALAXY_PALETTES[Math.abs(Math.round(seed)) % GALAXY_PALETTES.length];

  return (
    <div className="gd-visual" aria-hidden="true">
      <svg viewBox="0 0 240 200" preserveAspectRatio="xMidYMid slice" className="gd-visual-svg">
        <defs>
          <radialGradient id="gd-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor={palette.core}   stopOpacity="0.95"/>
            <stop offset="22%"  stopColor={palette.accent} stopOpacity="0.60"/>
            <stop offset="60%"  stopColor={palette.core}   stopOpacity="0.20"/>
            <stop offset="100%" stopColor={palette.core}   stopOpacity="0"/>
          </radialGradient>
          <radialGradient id="gd-disk" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor={palette.accent} stopOpacity="0.0"/>
            <stop offset="35%"  stopColor={palette.accent} stopOpacity="0.22"/>
            <stop offset="70%"  stopColor={palette.core}   stopOpacity="0.12"/>
            <stop offset="100%" stopColor={palette.core}   stopOpacity="0"/>
          </radialGradient>
          <radialGradient id="gd-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="white"          stopOpacity="0.90"/>
            <stop offset="40%"  stopColor={palette.core}   stopOpacity="0.30"/>
            <stop offset="100%" stopColor={palette.core}   stopOpacity="0"/>
          </radialGradient>
          <filter id="gd-soft">
            <feGaussianBlur stdDeviation="0.6"/>
          </filter>
        </defs>

        <g transform={`translate(120 100) rotate(${tilt})`} filter="url(#gd-soft)">
          <ellipse cx="0" cy="0" rx={rx * 1.18} ry={ry * 1.45} fill="url(#gd-disk)"/>
          <ellipse cx="0" cy="0" rx={rx} ry={ry} fill="url(#gd-core)"/>
          <ellipse cx="0" cy="0" rx={rx * 0.32} ry={ry * 0.5} fill="url(#gd-glow)"/>
          <circle cx="0" cy="0" r="2.4" fill="white" opacity="0.9"/>
        </g>
      </svg>
      <div className="gd-visual-meta">
        <span><b>{major.toFixed(2)}'</b>major</span>
        <span><b>{minor.toFixed(2)}'</b>minor</span>
        <span><b>{aspect.toFixed(2)}</b>a/b</span>
      </div>
    </div>
  );
}

export function GalaxyDetailPopup({ row, months, onClose }: GalaxyDetailPopupProps) {
  const major = parseFloat(row.metadata.major_arcmin || '0') || 0;
  const minor = parseFloat(row.metadata.minor_arcmin || '0') || 0;
  const ratio = parseFloat(row.metadata.axis_ratio_a_over_b || '0') || 0;
  const groups = buildFieldGroups(row);
  const peakIdx = row.months.indexOf(Math.max(...row.months));
  const heroName = (row.metadata.objname || '').trim() || `PGC ${row.pgc}`;

  return (
    <PopupShell
      popupId={POPUP_ID}
      className="galaxy-detail-popup"
      ariaLabel={STRINGS.GALAXY_DETAIL.popupAria(heroName)}
      onClose={onClose}
    >
      <header className="gd-head">
        <div className="gd-title-row">
          <div className="gd-title-block">
            <div className="gd-eyebrow">{STRINGS.GALAXY_DETAIL.pgcEyebrow(row.pgc)}</div>
            <div className="gd-title">{heroName}</div>
            {row.metadata.objtype && (
              <div className="gd-sub">{STRINGS.GALAXY_DETAIL.objtypeSub(row.metadata.objtype)}</div>
            )}
          </div>
          <button className="gd-x" aria-label={STRINGS.GALAXY_DETAIL.CLOSE_ARIA} onClick={onClose}>
            <Icon name="x" size={14}/>
          </button>
        </div>
      </header>

      <GalaxyVisual major={major} minor={minor} ratio={ratio}/>

      <div className="gd-score-strip">
        <div className="gd-score-cell">
          <span className="gd-score-num">{row.total.toFixed(1)}</span>
          <span className="gd-score-label">{STRINGS.GALAXY_DETAIL.SCORE_TOTAL}</span>
        </div>
        <div className="gd-score-cell">
          <span className="gd-score-num">{row.best}</span>
          <span className="gd-score-label">{STRINGS.GALAXY_DETAIL.SCORE_BEST}</span>
        </div>
        <div className="gd-score-cell">
          <span className="gd-score-num">{(row.months[peakIdx] ?? 0).toFixed(1)}</span>
          <span className="gd-score-label">{STRINGS.GALAXY_DETAIL.SCORE_PEAK}</span>
        </div>
      </div>

      <div className="gd-body">
        <section className="gd-section">
          <div className="gd-section-title">{STRINGS.GALAXY_DETAIL.MONTHLY_TITLE}</div>
          <div className="gd-month-row">
            {row.months.map((v, i) => {
              const max = Math.max(...row.months, 1);
              const intensity = v / max;
              return (
                <div
                  key={i}
                  className={'gd-month-cell' + (i === peakIdx ? ' peak' : '')}
                  style={{ background: `color-mix(in srgb, var(--accent) ${Math.round(intensity * 42)}%, transparent)` }}
                  title={`${months[i]} · ${v.toFixed(1)}`}
                >
                  <span className="gd-month-label">{months[i]}</span>
                  <span className="gd-month-value">{v.toFixed(0)}</span>
                </div>
              );
            })}
          </div>
        </section>

        {groups.map(group => (
          <section key={group.title} className="gd-section">
            <div className="gd-section-title">{group.title}</div>
            <div className="gd-fields">
              {group.items.map(({ label, value }) => (
                <div key={label} className="gd-field">
                  <span className="gd-field-label">{label}</span>
                  <span className="gd-field-value">{value}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </PopupShell>
  );
}

// Top-right visibility bar — ported from temp/sky-viewer.jsx (.sky-plate.top-right).
// Five toggle groups, all rendered as 26×26 square icon pills with a hover
// hint popover below:
//   1. Projection radio (rect / fisheye / stereo)
//   2. Star-density radio (full / balanced / performance)
//   3. Galaxy-density radio (full / balanced / performance)
//   4. Galaxy-mode radio (visual / true 1:1)
//   5. Sky button (independent toggle — hidden in CSS, state preserved)
//   6. Visibility group (stars / galaxies / constellations / grid / horizon /
//      ground / labels — independent toggles)

import { Icon } from '../../icons/Icon';
import { STRINGS } from '../../../lib/strings';
import type { Sky2Projection } from './shaders';
import type { Sky2Density, Sky2GalaxyMode } from './particleScene';

export interface Sky2Visibility {
  sun: boolean;
  moon: boolean;
  stars: boolean;
  galaxies: boolean;
  constellations: boolean;
  grid: boolean;
  horizon: boolean;
  ground: boolean;
  labels: boolean;
}

interface Props {
  projection: Sky2Projection;
  onProjectionChange: (p: Sky2Projection) => void;

  starDensity: Sky2Density;
  onStarDensityChange: (d: Sky2Density) => void;

  galaxyDensity: Sky2Density;
  onGalaxyDensityChange: (d: Sky2Density) => void;

  galaxyMode: Sky2GalaxyMode;
  onGalaxyModeChange: (m: Sky2GalaxyMode) => void;

  skyColor: boolean;
  onSkyColorChange: (v: boolean) => void;

  vis: Sky2Visibility;
  onVisToggle: (key: keyof Sky2Visibility) => void;
}

interface IconBtnProps {
  active: boolean;
  onClick: () => void;
  iconName: string;
  hint: string;
}

function IconBtn({ active, onClick, iconName, hint }: IconBtnProps) {
  return (
    <button
      type="button"
      className={'sky2-tog sky2-tog-ic' + (active ? ' on' : '')}
      onClick={onClick}
      aria-label={hint}
      aria-pressed={active}
    >
      <Icon name={iconName} size={15} stroke={1.5} />
      <span className="sky2-tog-hint">{hint}</span>
    </button>
  );
}

interface RadioOption<T extends string> {
  id: T;
  icon: string;
  hint: string;
}

interface RadioGroupProps<T extends string> {
  options: ReadonlyArray<RadioOption<T>>;
  value: T;
  onChange: (id: T) => void;
}

function RadioGroup<T extends string>({ options, value, onChange }: RadioGroupProps<T>) {
  return (
    <>
      {options.map((o) => (
        <IconBtn
          key={o.id}
          active={value === o.id}
          onClick={() => onChange(o.id)}
          iconName={o.icon}
          hint={o.hint}
        />
      ))}
    </>
  );
}

const Sep = () => <span className="sky2-tog-sep" />;

export function VisibilityBar2({
  projection, onProjectionChange,
  starDensity, onStarDensityChange,
  galaxyDensity, onGalaxyDensityChange,
  galaxyMode, onGalaxyModeChange,
  skyColor, onSkyColorChange,
  vis, onVisToggle,
}: Props) {
  const S = STRINGS.SKY2;

  const projOpts: ReadonlyArray<RadioOption<Sky2Projection>> = [
    { id: 'stereo',  icon: 'projection-stereographic', hint: S.HINT_PROJ_STEREO },
    { id: 'rect',    icon: 'projection-rectilinear',   hint: S.HINT_PROJ_RECT },
    { id: 'fisheye', icon: 'projection-fisheye',       hint: S.HINT_PROJ_FISHEYE },
  ];

  const starOpts: ReadonlyArray<RadioOption<Sky2Density>> = [
    { id: 'full',        icon: 'star-density-full',        hint: S.HINT_STAR_FULL },
    { id: 'balanced',    icon: 'star-density-balanced',    hint: S.HINT_STAR_BALANCED },
    { id: 'performance', icon: 'star-density-performance', hint: S.HINT_STAR_PERF },
  ];

  const galOpts: ReadonlyArray<RadioOption<Sky2Density>> = [
    { id: 'full',        icon: 'galaxy-density-full',        hint: S.HINT_GAL_FULL },
    { id: 'balanced',    icon: 'galaxy-density-balanced',    hint: S.HINT_GAL_BALANCED },
    { id: 'performance', icon: 'galaxy-density-performance', hint: S.HINT_GAL_PERF },
  ];

  const galModeOpts: ReadonlyArray<RadioOption<Sky2GalaxyMode>> = [
    { id: 'visual', icon: 'galaxy-mode-visual', hint: S.HINT_GAL_MODE_VISUAL },
    { id: 'true',   icon: 'galaxy-mode-true',   hint: S.HINT_GAL_MODE_TRUE },
  ];

  const layerOpts: ReadonlyArray<RadioOption<keyof Sky2Visibility>> = [
    { id: 'sun',            icon: 'layer-sun',            hint: S.HINT_LAYER_SUN },
    { id: 'moon',           icon: 'layer-moon',           hint: S.HINT_LAYER_MOON },
    { id: 'stars',          icon: 'layer-stars',          hint: S.HINT_LAYER_STARS },
    { id: 'galaxies',       icon: 'layer-galaxies',       hint: S.HINT_LAYER_GALAXIES },
    { id: 'constellations', icon: 'layer-constellations', hint: S.HINT_LAYER_CONSTELLATIONS },
    { id: 'grid',           icon: 'layer-grid',           hint: S.HINT_LAYER_GRID },
    { id: 'horizon',        icon: 'layer-horizon',        hint: S.HINT_LAYER_HORIZON },
    { id: 'ground',         icon: 'layer-ground',         hint: S.HINT_LAYER_GROUND },
    { id: 'labels',         icon: 'layer-labels',         hint: S.HINT_LAYER_LABELS },
  ];

  return (
    <div className="sky2-plate top-right">
      <div className="sky2-tog-row">
        <RadioGroup options={projOpts}     value={projection}    onChange={onProjectionChange} />
        <Sep />
        <RadioGroup options={starOpts}     value={starDensity}   onChange={onStarDensityChange} />
        <Sep />
        <RadioGroup options={galOpts}      value={galaxyDensity} onChange={onGalaxyDensityChange} />
        <Sep />
        <RadioGroup options={galModeOpts}  value={galaxyMode}    onChange={onGalaxyModeChange} />

        {/* Sky button — hidden via .sky2-tog-sky { display: none; } */}
        <button
          type="button"
          className={'sky2-tog sky2-tog-sky' + (skyColor ? ' on' : '')}
          onClick={() => onSkyColorChange(!skyColor)}
          aria-label={S.HINT_SKY_TOGGLE}
          aria-pressed={skyColor}
        >
          <span className="sky2-tog-sun" />
        </button>
        <Sep />

        {layerOpts.map((o) => (
          <IconBtn
            key={o.id}
            active={vis[o.id]}
            onClick={() => onVisToggle(o.id)}
            iconName={o.icon}
            hint={o.hint}
          />
        ))}
      </div>
    </div>
  );
}

import { SnapSlider } from '../../shared/SnapSlider';
import { STRINGS } from '../../../lib/strings';

/**
 * Galaxy planner has its own 3-level complexity table because the underlying
 * dataset is much larger than the 88-constellation set — the constellation
 * planner's 5-step slider would overshoot here:
 *
 *   index 0  →  --night-precision 3  --month-precision 5
 *   index 1  →  --night-precision 5  --month-precision 7
 *   index 2  →  --night-precision 8  --month-precision 8
 */
export interface GalaxyComplexity {
  night: number;
  month: number;
}

export const GALAXY_COMPLEXITIES: readonly GalaxyComplexity[] = [
  { night: 3, month: 5 },
  { night: 5, month: 7 },
  { night: 8, month: 8 },
] as const;


interface GalaxyComplexitySliderProps {
  snap: number;
  onChange: (snap: number) => void;
}

export function GalaxyComplexitySlider({ snap, onChange }: GalaxyComplexitySliderProps) {
  const value = GALAXY_COMPLEXITIES[snap];
  const label = STRINGS.GALAXY_COMPLEXITY_SLIDER.LABELS[snap];
  return (
    <SnapSlider
      snap={snap}
      onChange={onChange}
      tickLabels={STRINGS.GALAXY_COMPLEXITY_SLIDER.LABELS}
      label={STRINGS.GALAXY_COMPLEXITY_SLIDER.LABEL}
      valueText={STRINGS.GALAXY_COMPLEXITY_SLIDER.valueText(label, value.night, value.month)}
      ariaLabel={STRINGS.GALAXY_COMPLEXITY_SLIDER.ARIA}
    />
  );
}

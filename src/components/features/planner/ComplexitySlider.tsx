import { SnapSlider } from '../../shared/SnapSlider';
import { STRINGS } from '../../../lib/strings';

export const COMPLEXITY_VALUES = [1, 3, 5, 7, 10] as const;

interface ComplexitySliderProps {
  snap: number;
  onChange: (snap: number) => void;
}

export function ComplexitySlider({ snap, onChange }: ComplexitySliderProps) {
  const value = COMPLEXITY_VALUES[snap];
  const label = STRINGS.COMPLEXITY_SLIDER.LABELS[snap];
  return (
    <SnapSlider
      snap={snap}
      onChange={onChange}
      tickLabels={STRINGS.COMPLEXITY_SLIDER.LABELS}
      label={STRINGS.COMPLEXITY_SLIDER.LABEL}
      valueText={STRINGS.COMPLEXITY_SLIDER.valueText(label, value)}
      ariaLabel={STRINGS.COMPLEXITY_SLIDER.ARIA}
    />
  );
}

import { Icon } from '../../icons/Icon';
import { STRINGS } from '../../../lib/strings';

interface Props {
  fov: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRecenter: () => void;
}

// Structure ported verbatim from temp/sky-viewer.jsx — same button sizes,
// readout typography, and reset-icon usage as the design source.
export function ZoomControls2({ fov, onZoomIn, onZoomOut, onRecenter }: Props) {
  const S = STRINGS.SKY2;
  return (
    <div className="sky2-zoom">
      <button type="button" className="sky2-zoom-btn" onClick={onZoomIn} aria-label={S.ZOOM_IN_ARIA}>+</button>
      <div className="sky2-zoom-readout">{Math.round(fov)}°</div>
      <button type="button" className="sky2-zoom-btn" onClick={onZoomOut} aria-label={S.ZOOM_OUT_ARIA}>−</button>
      <div className="sky2-zoom-divider" />
      <button type="button" className="sky2-zoom-btn" onClick={onRecenter} aria-label={S.RECENTER_ARIA}>
        <Icon name="reset" size={12} />
      </button>
    </div>
  );
}

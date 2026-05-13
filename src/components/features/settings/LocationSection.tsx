import { useEffect, useState } from 'react';
import { Icon } from '../../icons/Icon';
import { dispatch } from '../../../lib/notifications';
import { STRINGS } from '../../../lib/strings';
import { useLocation } from '../../../hooks/useLocation';

const ALLOWED_KEYS = new Set([
  'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'Home', 'End', 'Tab', 'Enter',
]);
const COORD_CHAR = /^[0-9.\-]$/;
const SAVED_FEEDBACK_MS = 1500;

function isValidCoord(raw: string, min: number, max: number): boolean {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= min && n <= max;
}

function blockNonCoord(e: React.KeyboardEvent<HTMLInputElement>): void {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (ALLOWED_KEYS.has(e.key)) return;
  if (e.key.length === 1 && !COORD_CHAR.test(e.key)) e.preventDefault();
}

export function LocationSection() {
  const { location, source, saveLocation } = useLocation();
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (location) {
      setLat(location.lat.toString());
      setLng(location.lng.toString());
    }
  }, [location]);

  // System location (macOS CoreLocation) is temporarily disabled.
  // const onSystem = async () => {
  //   const coords = await fetchSystemLocation();
  //   if (coords) {
  //     setLat(coords.lat.toString());
  //     setLng(coords.lng.toString());
  //   }
  // };

  const onSave = async () => {
    if (!isValidCoord(lat, -90, 90) || !isValidCoord(lng, -180, 180)) {
      dispatch('Error', STRINGS.LOCATION.ERR_INVALID);
      return;
    }
    const ok = await saveLocation(Number.parseFloat(lat), Number.parseFloat(lng), 'manual');
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), SAVED_FEEDBACK_MS);
    }
  };

  const onLatBlur = () => {
    if (lat !== '' && !isValidCoord(lat, -90, 90)) {
      dispatch('Error', STRINGS.LOCATION.ERR_LAT);
    }
  };
  const onLngBlur = () => {
    if (lng !== '' && !isValidCoord(lng, -180, 180)) {
      dispatch('Error', STRINGS.LOCATION.ERR_LNG);
    }
  };

  return (
    <div className="loc-section">
      {/* System location button disabled — macOS CoreLocation not working in production builds.
      <div className="loc-system">
        <button className="btn ghost" onClick={onSystem} disabled={fetchingSystem}>
          <Icon name="map-pin" size={12}/>
          {fetchingSystem ? STRINGS.LOCATION.BTN_LOCATING : STRINGS.LOCATION.BTN_SYSTEM}
        </button>
        <span className="loc-source">
          {source === 'system' ? STRINGS.LOCATION.SOURCE_SYSTEM :
           source === 'manual' ? STRINGS.LOCATION.SOURCE_MANUAL :
           STRINGS.LOCATION.SOURCE_NONE}
        </span>
      </div>
      */}

      <span className="loc-source">
        {source === 'manual' ? STRINGS.LOCATION.SOURCE_MANUAL : STRINGS.LOCATION.SOURCE_NONE}
      </span>

      <div className="loc-fields">
        <label className="loc-field">
          <span className="loc-label">{STRINGS.LOCATION.LABEL_LAT}</span>
          <input
            type="text"
            inputMode="decimal"
            value={lat}
            placeholder={STRINGS.LOCATION.PLACEHOLDER_LAT}
            onChange={e => setLat(e.target.value)}
            onKeyDown={blockNonCoord}
            onBlur={onLatBlur}
          />
        </label>
        <label className="loc-field">
          <span className="loc-label">{STRINGS.LOCATION.LABEL_LNG}</span>
          <input
            type="text"
            inputMode="decimal"
            value={lng}
            placeholder={STRINGS.LOCATION.PLACEHOLDER_LNG}
            onChange={e => setLng(e.target.value)}
            onKeyDown={blockNonCoord}
            onBlur={onLngBlur}
          />
        </label>
        <button
          className={'btn primary loc-save' + (saved ? ' saved' : '')}
          onClick={onSave}
          disabled={saved}
        >
          {saved ? <><Icon name="check" size={12}/> {STRINGS.LOCATION.BTN_SAVED}</> : STRINGS.LOCATION.BTN_SAVE}
        </button>
      </div>
    </div>
  );
}

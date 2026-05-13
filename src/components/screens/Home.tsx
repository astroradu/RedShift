import { useMemo } from 'react';
import { BrandMark } from '../brand/BrandMark';
import { Icon } from '../icons/Icon';
import { useApiQuery } from '../../hooks/useApiQuery';
import { QUOTES } from '../../data/quotes';
import type { Feature, Location } from '../../types';
import { STRINGS } from '../../lib/strings';
import { formatLat, formatLng } from '../../lib/formatLocation';

interface HomeProps {
  onPick: (feature: Feature) => void;
  location: Location | null;
}

export function Home({ onPick, location }: HomeProps) {
  const { data } = useApiQuery<Feature[]>('/api/features');
  const features = data ?? [];
  const quote = useMemo(() => QUOTES[Math.floor(Math.random() * QUOTES.length)], []);
  return (
    <div className="home fade-enter fade-in">
      <div className="home-eyebrow">{STRINGS.HOME.EYEBROW}</div>
      <div className="home-wordmark-group">
        <h1 className="home-wordmark">
          <span className="hw-mark"><BrandMark size={68}/></span>
          <span className="hw-text"><span className="hw-red">Red</span><span className="hw-shift">Shift</span></span>
        </h1>
        <div className="home-byline">{STRINGS.HOME.BYLINE}</div>
      </div>
      <p className="home-tagline">
        &ldquo;{quote.text}&rdquo;
        {quote.author !== 'Unknown' && <span className="home-tagline-attr"> — {quote.author}</span>}
      </p>
      <div className="home-coords">
        {location !== null && (
          <>
            <span><b>{STRINGS.HOME.COORD_LAT}</b> {formatLat(location.lat)}</span>
            <span><b>{STRINGS.HOME.COORD_LNG}</b> {formatLng(location.lng)}</span>
          </>
        )}
        <span><b>{STRINGS.HOME.POWERED_LABEL}</b> {STRINGS.HOME.POWERED_TECH}</span>
      </div>
      <div className="feature-grid">
        {features.map((f, i) => (
          <button
            key={f.id}
            className="card"
            style={{ animationDelay: `${i * 60}ms` }}
            onClick={() => onPick(f)}
          >
            <div className="card-head">
              <div className="card-icon"><Icon name={f.icon} size={22}/></div>
            </div>
            <h3 className="card-name">{f.name}</h3>
            <p className="card-desc">{f.desc}</p>
            <div className="card-foot">
              <span>{STRINGS.HOME.CARD_FOOTER}</span>
              <span className="arrow"><Icon name="arrow-right" size={12}/></span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

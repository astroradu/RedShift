// Top-left selection card — ported from temp/sky-viewer.jsx (.sky-plate.top-left).
// Surfaces full catalogue details for the currently selected star or galaxy.
// Hidden when nothing is selected.

import { forwardRef } from 'react';
import { STRINGS } from '../../../lib/strings';
import { raDecToAltAz } from '../../../lib/skyMath';
import {
  formatAlt,
  formatArcmin,
  formatAz,
  formatDec,
  formatRA,
} from '../../../lib/skyFormat';
import type { Selection } from './selection';

const DEG = Math.PI / 180;

interface Props {
  selection: Selection | null;
  lstRad: number;
  latRad: number;
}

interface MetaSegment {
  label: string;
  value: string;
}

function MetaRow({ segments }: { segments: MetaSegment[] }) {
  if (segments.length === 0) return null;
  return (
    <div className="sky2-meta">
      {segments.map((s) => (
        <span key={s.label}><b>{s.label}</b>{s.value}</span>
      ))}
    </div>
  );
}

// RA/Dec + Alt/Az rows are identical for stars and galaxies once we have the
// equatorial coordinates in radians. Returns two rows ready to render.
function coordinateRows(raRad: number, decRad: number, lstRad: number, latRad: number) {
  const S = STRINGS.SKY2;
  const { altRad, azRad } = raDecToAltAz(raRad, decRad, lstRad, latRad);
  const eqRow: MetaSegment[] = [
    { label: S.CARD_FIELD_RA,  value: formatRA(raRad) },
    { label: S.CARD_FIELD_DEC, value: formatDec(decRad) },
  ];
  const horizRow: MetaSegment[] = [
    { label: S.CARD_FIELD_ALT, value: formatAlt(altRad) },
    { label: S.CARD_FIELD_AZ,  value: formatAz(azRad) },
  ];
  return { eqRow, horizRow };
}

export const ObjectInfoCard2 = forwardRef<HTMLElement, Props>(function ObjectInfoCard2(
  { selection, lstRad, latRad },
  ref,
) {
  if (!selection) return null;

  const S = STRINGS.SKY2;
  const raRad  = selection.kind === 'star' ? selection.star.ra_rad  : selection.galaxy.ra_deg * DEG;
  const decRad = selection.kind === 'star' ? selection.star.dec_rad : selection.galaxy.dec_deg * DEG;
  const coords = coordinateRows(raRad, decRad, lstRad, latRad);

  if (selection.kind === 'star') {
    const s = selection.star;

    const eyebrow = s.spectrum
      ? `${S.CARD_KIND_STAR} · ${s.spectrum}`
      : S.CARD_KIND_STAR;

    const idRow: MetaSegment[] = [];
    if (s.bayer_flamsteed) idRow.push({ label: S.CARD_FIELD_BAYER, value: s.bayer_flamsteed });
    if (s.hd != null)      idRow.push({ label: S.CARD_FIELD_HD,    value: String(s.hd) });
    if (s.hr != null)      idRow.push({ label: S.CARD_FIELD_HR,    value: String(s.hr) });
    if (s.gliese)          idRow.push({ label: S.CARD_FIELD_GL,    value: s.gliese });

    const magRow: MetaSegment[] = [{ label: S.CARD_FIELD_MAG, value: s.mag.toFixed(2) }];
    if (s.abs_mag != null) {
      const sign = s.abs_mag >= 0 ? '+' : '−';
      magRow.push({
        label: S.CARD_FIELD_ABS_MAG,
        value: `${sign}${Math.abs(s.abs_mag).toFixed(2)}`,
      });
    }
    if (s.color_index != null) {
      magRow.push({ label: S.CARD_FIELD_BV, value: s.color_index.toFixed(2) });
    }

    const distRow: MetaSegment[] = [];
    if (s.distance_ly != null) {
      distRow.push({
        label: S.CARD_FIELD_DIST,
        value: `${s.distance_ly.toFixed(1)} ${S.CARD_UNIT_LY}`,
      });
    }

    return (
      <aside className="sky2-plate top-left" ref={ref}>
        <div className="sky2-eyebrow">{eyebrow}</div>
        <div className="sky2-title">{s.name}</div>
        <MetaRow segments={idRow} />
        <MetaRow segments={magRow} />
        <MetaRow segments={distRow} />
        <MetaRow segments={coords.eqRow} />
        <MetaRow segments={coords.horizRow} />
      </aside>
    );
  }

  const g = selection.galaxy;

  const eyebrow = `${S.CARD_KIND_GALAXY} · ${S.CARD_GALAXY_CATALOGUE}`;

  const altNamesRow: MetaSegment[] = [];
  if (g.alt_names.length > 0) {
    altNamesRow.push({ label: S.CARD_FIELD_ALT_NAMES, value: g.alt_names.join(', ') });
  }

  const magRow: MetaSegment[] = [];
  if (g.mag != null) magRow.push({ label: S.CARD_FIELD_MAG, value: g.mag.toFixed(2) });
  if (g.distance_mly != null) {
    magRow.push({
      label: S.CARD_FIELD_DIST,
      value: `${g.distance_mly.toFixed(2)} ${S.CARD_UNIT_MLY}`,
    });
  }

  const sizeRow: MetaSegment[] = [
    {
      label: S.CARD_FIELD_SIZE,
      value: `${formatArcmin(g.major_arcmin)} × ${formatArcmin(g.minor_arcmin)}`,
    },
    { label: S.CARD_FIELD_PA, value: `${Math.round(g.angle_deg)}°` },
  ];

  return (
    <aside className="sky2-plate top-left" ref={ref}>
      <div className="sky2-eyebrow">{eyebrow}</div>
      <div className="sky2-title">{g.name}</div>
      <MetaRow segments={altNamesRow} />
      <MetaRow segments={magRow} />
      <MetaRow segments={sizeRow} />
      <MetaRow segments={coords.eqRow} />
      <MetaRow segments={coords.horizRow} />
    </aside>
  );
});

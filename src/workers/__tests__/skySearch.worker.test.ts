import { describe, expect, test } from 'vitest';
import { buildIndex, rankQuery } from '../skySearch.worker';
import type { NotableStar, Galaxy } from '../../types';

const star = (id: number, over: Partial<NotableStar> = {}): NotableStar => ({
  id,
  name: '',
  hd: null,
  hr: null,
  gliese: null,
  bayer_flamsteed: null,
  proper_name: null,
  ra_rad: 0,
  dec_rad: 0,
  mag: 5,
  abs_mag: null,
  spectrum: null,
  color_index: null,
  distance_ly: null,
  ...over,
});
const gal = (id: string, over: Partial<Galaxy> = {}): Galaxy => ({
  id,
  name: '',
  alt_names: [],
  ra_deg: 0,
  dec_deg: 0,
  major_arcmin: 1,
  minor_arcmin: 1,
  angle_deg: 0,
  tint: 'cool',
  mag: null,
  distance_mly: null,
  ...over,
});

describe('search worker — buildIndex + rankQuery', () => {
  const stars: NotableStar[] = [
    star(1, { name: 'Vega',     proper_name: 'Vega',     bayer_flamsteed: 'α Lyr', mag: 0.03 }),
    star(2, { name: 'Altair',   proper_name: 'Altair',   bayer_flamsteed: 'α Aql', mag: 0.77 }),
    star(3, { name: 'Deneb',    proper_name: 'Deneb',    bayer_flamsteed: 'α Cyg', mag: 1.25 }),
    star(4, { name: 'Arcturus', proper_name: 'Arcturus', bayer_flamsteed: 'α Boo', mag: -0.05 }),
  ];
  const galaxies: Galaxy[] = [
    gal('PGC2557',   { name: 'Andromeda Galaxy', alt_names: ['M31', 'NGC 224'] }),
    gal('PGC54559',  { name: 'Whirlpool Galaxy', alt_names: ['M51'] }),
    gal('PGC42407',  { name: 'Sombrero Galaxy',  alt_names: ['M104'] }),
  ];

  const idx = buildIndex(stars, galaxies);

  test('exact-name match returns the named row first', () => {
    const r = rankQuery(idx, 'vega', { stars: true, galaxies: true });
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items[0].kind).toBe('star');
    expect((r.items[0] as { star: NotableStar }).star.name).toBe('Vega');
  });

  test('alt_names finds Andromeda via "M31"', () => {
    const r = rankQuery(idx, 'm31', { stars: true, galaxies: true });
    expect(r.items[0].kind).toBe('galaxy');
    expect((r.items[0] as { galaxy: Galaxy }).galaxy.name).toBe('Andromeda Galaxy');
  });

  test('token-prefix query "and gal" lands Andromeda', () => {
    const r = rankQuery(idx, 'and gal', { stars: true, galaxies: true });
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items[0].kind).toBe('galaxy');
    expect((r.items[0] as { galaxy: Galaxy }).galaxy.name).toBe('Andromeda Galaxy');
  });

  test('caps results at 5', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      star(100 + i, { name: `Sirius${i}`, proper_name: `Sirius${i}` }),
    );
    const idxBig = buildIndex(many, []);
    const r = rankQuery(idxBig, 'sirius', { stars: true, galaxies: true });
    expect(r.items.length).toBe(5);
  });

  test('visibility filter drops a kind and reports hiddenHitCount', () => {
    const r = rankQuery(idx, 'galaxy', { stars: true, galaxies: false });
    expect(r.items.every((i) => i.kind === 'star')).toBe(true);
    expect(r.hiddenHitCount).toBeGreaterThan(0);
  });

  test('empty query returns nothing', () => {
    const r = rankQuery(idx, '', { stars: true, galaxies: true });
    expect(r.items).toEqual([]);
    expect(r.hiddenHitCount).toBe(0);
  });
});

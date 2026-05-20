export interface Feature {
  id: string;
  num: string;
  name: string;
  desc: string;
  meta: string;
  icon: string;
  toolbar: boolean;
}

export interface Tool {
  id: string;
  label: string;
  icon: string;
}

export interface PaletteVars {
  '--bg': string;
  '--surface': string;
  '--surface-2': string;
  '--accent': string;
  '--accent-2': string;
  '--text': string;
  '--muted': string;
  '--hairline': string;
  '--hairline-strong': string;
  '--glow': string;
  '--glow-violet': string;
  '--inset': string;
  '--noise-opacity': string;
  '--star-opacity': string;
  '--grid-line': string;
}

export interface Palette {
  id: string;
  name: string;
  desc: string;
  dark: PaletteVars;
  light: PaletteVars;
}

export type Mode = 'dark' | 'light';
export type View = 'home' | 'detail' | 'settings';

export interface AppSettings {
  mode: Mode;
  palette: string;
}

export interface Location {
  lat: number;
  lng: number;
}

export type LocationSource = 'system' | 'manual' | 'none';

export interface LocationState {
  location: Location | null;
  source: LocationSource;
}

export interface PlannerRow {
  name: string;
  months: number[];
  best: string;
  total: number;
  circumpolar: boolean;
}

export interface PlannerBest {
  name: string;
  total: number;
}

export interface PlannerKpis {
  best_constellation: PlannerBest;
  best_non_circumpolar: PlannerBest | null;
  peak_month: string;
  average_per_target_h: number;
  engine_runtime_s: number;
}

export interface PlannerResultsResponse {
  rows: PlannerRow[];
  months: string[];
  kpis: PlannerKpis;
}

export interface GalaxyRow {
  pgc: string;
  months: number[];
  best: string;
  total: number;
  metadata: Record<string, string>;
}

export interface GalaxyResultsResponse {
  rows: GalaxyRow[];
  months: string[];
  metadata_columns: string[];
  total_rows: number;
  engine_runtime_s: number;
}

export interface GalaxyPlannerProgressEvent {
  percent: number;
  status_index: number;
  status: string;
}

export interface GalaxyPlannerDoneEvent {
  result_id: string;
}

export interface StarCatalogueMeta {
  count: number;
  field_count: number;
  field_names: string[];
  dtype: 'float32';
  endianness: 'little';
}

export interface NotableStar {
  id: number;
  name: string;
  hd: number | null;
  hr: number | null;
  gliese: string | null;
  bayer_flamsteed: string | null;
  proper_name: string | null;
  ra_rad: number;
  dec_rad: number;
  mag: number;
  abs_mag: number | null;
  spectrum: string | null;
  color_index: number | null;
  distance_ly: number | null;
}

export interface Galaxy {
  id: string;
  name: string;
  alt_names: string[];
  ra_deg: number;
  dec_deg: number;
  major_arcmin: number;
  minor_arcmin: number;
  angle_deg: number;
  tint: 'warm' | 'cool';
  mag: number | null;
  distance_mly: number | null;
}

export interface ConstellationStar {
  id: number;
  bfID: string;
  ra_h: number;
  dec_d: number;
}

export interface Constellation {
  name: string;
  center_ra_h: number;
  center_dec_d: number;
  stars: ConstellationStar[];
  lines: [number, number][];
}

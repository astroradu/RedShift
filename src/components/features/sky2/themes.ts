export interface Sky2Theme {
  bg: string;
  tint: [number, number, number];
  palette: [number, number, number][];
  weights: number[];
  brightness: number;
  gridBase: number;
}

export const AURORA: Sky2Theme = {
  bg: '#03060f',
  tint: [0.04, 0.08, 0.20],
  palette: [
    [0.18, 0.95, 1.00],
    [0.45, 0.55, 1.00],
    [0.95, 0.30, 1.00],
    [0.78, 1.00, 0.96],
    [1.00, 0.92, 0.98],
  ],
  weights: [0.36, 0.26, 0.20, 0.12, 0.06],
  brightness: 1.0,
  gridBase: 0.22,
};

import type { Galaxy, NotableStar } from '../../../types';

export type Selection =
  | { kind: 'star'; star: NotableStar; renderIndex: number }
  | { kind: 'galaxy'; galaxy: Galaxy };

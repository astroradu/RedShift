import { defineSessionSlot } from '../../../lib/sessionCache';
import type { GalaxyResultsResponse, PlannerResultsResponse } from '../../../types';

/**
 * Session-cache slots for the two planner tools. The cache itself
 * (`src/lib/sessionCache.ts`) is generic — these tokens are the only place the
 * planner-specific shapes are pinned down. Any future tool follows the same
 * pattern: define a slot near the consumer, store whatever the tool needs to
 * restore its results view.
 */

export interface ConstellationSession {
  data: PlannerResultsResponse;
  period: string;
}

export interface GalaxySession {
  data: GalaxyResultsResponse;
  period: string;
  computeNonstandard: boolean;
  minAngularSize: number;
}

export const CONSTELLATION_PLANNER_SLOT =
  defineSessionSlot<ConstellationSession>('planner-constellation');

export const GALAXY_PLANNER_SLOT =
  defineSessionSlot<GalaxySession>('planner-galaxy');

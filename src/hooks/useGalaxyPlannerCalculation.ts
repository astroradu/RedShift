import { useApiSSE } from './useApiSSE';
import type { GalaxyPlannerDoneEvent, GalaxyPlannerProgressEvent } from '../types';

/**
 * Thin wrapper around `useApiSSE` typed for the galaxy planner stream.
 *
 * Mirrors the constellation planner's calculation hook — the actual SSE
 * plumbing lives in `subscribeSSE` (api.ts); this hook just narrows the
 * progress / done payload types so callers don't have to spell them out.
 */
export function useGalaxyPlannerCalculation() {
  return useApiSSE<GalaxyPlannerProgressEvent, GalaxyPlannerDoneEvent>();
}

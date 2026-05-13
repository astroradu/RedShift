import { useApiQuery } from './useApiQuery';
import type { GalaxyResultsResponse } from '../types';

/**
 * Fetches the latest cached galaxy planner results for a given (period,
 * computeNonstandard, minAngularSize) combination. The backend stores results
 * keyed on all three so the UI can switch between them without recomputing.
 */
export function useGalaxyPlannerResults(
  period: string,
  computeNonstandard: boolean,
  minAngularSize: number,
  enabled: boolean = true,
) {
  const path = enabled
    ? `/api/galaxy-planner/results?period=${encodeURIComponent(period)}` +
      `&compute_nonstandard=${computeNonstandard ? 'true' : 'false'}` +
      `&min_angular_size=${minAngularSize}`
    : null;
  return useApiQuery<GalaxyResultsResponse>(path, [period, computeNonstandard, minAngularSize, enabled]);
}

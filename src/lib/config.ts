/**
 * Sky Viewer star count cap. Set to a number to render only the N brightest
 * (useful for testing or low-end hardware); null fetches the full HYG catalogue
 * (~87k stars). The GPU does one draw call regardless of count.
 */
export const SKY_VIEWER_STAR_LIMIT: number | null = null;

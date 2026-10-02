/** "136 min" → "2h 16min"; `undefined` when Cinemeta's runtime can't be read. */
export function formatRuntime(runtime: string | undefined): string | undefined {
  const minutes = Number.parseInt(runtime ?? '', 10);
  if (!Number.isFinite(minutes) || minutes <= 0) return undefined;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}min`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}min`;
}

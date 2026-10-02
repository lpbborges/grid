/** Whether a title can be watched yet: its release date has passed, or, without a date, its year is before this one. */
export function isReleased(
  item: { releaseDate?: string; year: number },
  now = new Date()
): boolean {
  const date = item.releaseDate ? Date.parse(item.releaseDate) : NaN;
  if (!Number.isNaN(date)) return date <= now.getTime();
  return item.year > 0 && item.year < now.getFullYear();
}

/** Days a film stays in cinemas before a copy to watch at home is likely to exist. */
export const CINEMA_WINDOW_DAYS = 45;

/** Whether a title can be played: a series once aired, a film once its cinema run is over. */
export function isAvailable(
  item: { releaseDate?: string; year: number },
  type: 'movie' | 'series',
  now = new Date()
): boolean {
  if (type === 'series') return isReleased(item, now);
  return isReleased(item, new Date(now.getTime() - CINEMA_WINDOW_DAYS * 86_400_000));
}

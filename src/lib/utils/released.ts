/** Whether a title can be watched yet: its release date has passed, or, without a date, its year is before this one. */
export function isReleased(
  item: { releaseDate?: string; year: number },
  now = new Date()
): boolean {
  const date = item.releaseDate ? Date.parse(item.releaseDate) : NaN;
  if (!Number.isNaN(date)) return date <= now.getTime();
  return item.year > 0 && item.year < now.getFullYear();
}

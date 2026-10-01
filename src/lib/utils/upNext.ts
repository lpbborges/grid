/** The card appears this long before the end of an episode, at most. */
export const UP_NEXT_LEAD_SECONDS = 30;
/** How long the card counts down before the next episode starts. */
export const UP_NEXT_COUNTDOWN_SECONDS = 10;
const MAX_LEAD_SHARE = 0.2;

export function upNextLeadSeconds(duration: number): number {
  return Math.min(UP_NEXT_LEAD_SECONDS, duration * MAX_LEAD_SHARE);
}

export function isNearEnd(currentTime: number, duration: number): boolean {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(currentTime)) return false;
  return currentTime >= duration - upNextLeadSeconds(duration);
}

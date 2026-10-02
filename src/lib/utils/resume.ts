import type { ProgressData } from '$lib/types';

export const MIN_RESUME_SECONDS = 60;

/** Where to offer resuming from, or `null` when playback should simply start. */
export function resumeSeconds(progress: ProgressData | undefined): number | null {
  return progress && progress.time >= MIN_RESUME_SECONDS ? progress.time : null;
}

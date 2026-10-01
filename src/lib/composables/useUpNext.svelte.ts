import { untrack } from 'svelte';
import { isNearEnd, UP_NEXT_COUNTDOWN_SECONDS } from '$lib/utils/upNext';

export interface UpNextSource {
  /** Identifies the file playing; '' while nothing plays. A new key resets the card. */
  readonly key: string;
  readonly currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  readonly hasNext: boolean;
}

/** `source` must be an object of getters, or the countdown restarts on every clock tick. */
export function useUpNext(
  source: UpNextSource,
  onadvance: () => void,
  countdownSeconds = UP_NEXT_COUNTDOWN_SECONDS
) {
  let key = $state('');
  let cancelled = $state(false);
  let fired = $state(false);
  let secondsLeft = $state(countdownSeconds);
  let nearEndWhenLastSeen = false;

  const nearEnd = $derived(isNearEnd(source.currentTime, source.duration));
  const visible = $derived(source.key !== '' && source.hasNext && nearEnd && !cancelled && !fired);

  $effect.pre(() => {
    const next = source.key;
    if (next === untrack(() => key)) return;
    key = next;
    cancelled = false;
    fired = false;
    nearEndWhenLastSeen = false;
    secondsLeft = countdownSeconds;
  });

  $effect.pre(() => {
    // A clock without a length is mpv resetting at the end of the file.
    if (source.duration > 0) nearEndWhenLastSeen = nearEnd;
  });

  function fire() {
    if (fired) return;
    fired = true;
    onadvance();
  }

  $effect(() => {
    if (!visible) {
      secondsLeft = countdownSeconds;
      return;
    }
    if (source.paused) return;
    const timer = setInterval(() => {
      secondsLeft -= 1;
      if (secondsLeft <= 0) {
        clearInterval(timer);
        fire();
      }
    }, 1000);
    return () => clearInterval(timer);
  });

  return {
    get visible() {
      return visible;
    },
    get secondsLeft() {
      return secondsLeft;
    },
    /** The card was up when the clock last moved: what an end of file should act on. */
    armed: () => nearEndWhenLastSeen && source.hasNext && !cancelled && !fired,
    playNow: fire,
    cancel: () => {
      cancelled = true;
    }
  };
}

export function createUpNextSource(initial: {
  key?: string;
  currentTime?: number;
  duration?: number;
  paused?: boolean;
  hasNext?: boolean;
}) {
  let key = $state(initial.key ?? 'T1:E1');
  let currentTime = $state(initial.currentTime ?? 0);
  let duration = $state(initial.duration ?? 2700);
  let paused = $state(initial.paused ?? false);
  let hasNext = $state(initial.hasNext ?? true);
  return {
    get key() {
      return key;
    },
    set key(v) {
      key = v;
    },
    get currentTime() {
      return currentTime;
    },
    set currentTime(v) {
      currentTime = v;
    },
    get duration() {
      return duration;
    },
    set duration(v) {
      duration = v;
    },
    get paused() {
      return paused;
    },
    set paused(v) {
      paused = v;
    },
    get hasNext() {
      return hasNext;
    },
    set hasNext(v) {
      hasNext = v;
    }
  };
}

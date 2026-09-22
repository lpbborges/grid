import { vi } from 'vitest';

export function createFakeMpvBackend() {
  let currentTime = $state(0);
  let duration = $state(0);
  let error = $state('');

  return {
    hasStarted: false,
    buffering: false,
    get error() {
      return error;
    },
    set error(v) {
      error = v;
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
    paused: true,
    volume: 1,
    audioTracks: [],
    activeAudioIndex: -1,
    subtitles: [],
    activeSubtitleIndex: -1,
    failedSubtitleIndexes: [],
    subtitleError: '',
    start: vi.fn().mockImplementation(function (
      this: { onended: (() => void) | undefined },
      request: { onended?: () => void }
    ) {
      if (request.onended) this.onended = request.onended;
      return Promise.resolve(true);
    }),
    stop: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    togglePlay: vi.fn(),
    toggleFullscreen: vi.fn(),
    selectAudio: vi.fn(),
    selectSubtitle: vi.fn(),
    syncOverlayLayout: vi.fn(),
    onended: undefined as (() => void) | undefined,
    emitEnded() {
      if (this.onended) this.onended();
    }
  };
}

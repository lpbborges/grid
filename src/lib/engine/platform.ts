/**
 * Which playback path this build uses.
 *
 * Windows and Linux play through libmpv running inside Grid; macOS keeps the
 * `<video>` element. WebView2 cannot decode the codecs torrent releases actually
 * ship (HEVC, AC3/E-AC3) and cannot demux Matroska over range requests, and on
 * WebKitGTK the `<video>` element loses the embedded subtitle and audio tracks.
 * Android user agents also contain "Linux"; Grid ships no Android build, so the
 * Linux match needs no exception for it.
 *
 * One export, one decision point. There is deliberately no `invoke('is_windows')`
 * command: the platform is knowable from the webview, and a single pure function
 * is trivially mockable in tests.
 */
export type PlaybackMode = 'native' | 'embedded';

/**
 * `override` is the build-time `VITE_GRID_NATIVE_PLAYER` value. `off` forces the
 * `<video>` path, which is how the existing E2E specs keep running
 * unchanged; `on` forces the native path for the spec that exercises it.
 */
export function resolvePlaybackMode(userAgent: string, override: string | undefined): PlaybackMode {
  const forced = override?.trim().toLowerCase();
  if (forced === 'off') return 'embedded';
  if (forced === 'on') return 'native';
  return /windows|linux/i.test(userAgent) ? 'native' : 'embedded';
}

export function playbackMode(): PlaybackMode {
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  return resolvePlaybackMode(userAgent, import.meta.env.VITE_GRID_NATIVE_PLAYER);
}

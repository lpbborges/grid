import { describe, it, expect } from 'vitest';
import { resolvePlaybackMode } from './platform';

const WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0';
const LINUX_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

describe('resolvePlaybackMode', () => {
  it('plays natively on Windows, where WebView2 cannot decode the content', () => {
    expect(resolvePlaybackMode(WINDOWS_UA, undefined)).toBe('native');
  });

  it('plays natively on Linux too, where the <video> element loses embedded subtitles', () => {
    expect(resolvePlaybackMode(LINUX_UA, undefined)).toBe('native');
  });

  it('keeps the <video> element on macOS', () => {
    expect(resolvePlaybackMode('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', undefined)).toBe(
      'embedded'
    );
  });

  it('lets the E2E build force the <video> path on Windows', () => {
    // How the existing Windows specs keep running unchanged.
    expect(resolvePlaybackMode(WINDOWS_UA, 'off')).toBe('embedded');
  });

  it('lets the E2E build force the <video> path on Linux', () => {
    expect(resolvePlaybackMode(LINUX_UA, 'off')).toBe('embedded');
  });

  it('lets the E2E build force the native path anywhere', () => {
    expect(resolvePlaybackMode(LINUX_UA, 'on')).toBe('native');
  });

  it('ignores an unset or unrecognised override', () => {
    for (const override of ['', '   ', 'yes', 'true']) {
      expect(resolvePlaybackMode(WINDOWS_UA, override)).toBe('native');
      expect(resolvePlaybackMode(LINUX_UA, override)).toBe('native');
    }
  });

  it('accepts the override regardless of case or padding', () => {
    expect(resolvePlaybackMode(WINDOWS_UA, ' OFF ')).toBe('embedded');
    expect(resolvePlaybackMode(LINUX_UA, 'On')).toBe('native');
  });

  it('falls back to the embedded player when the user agent is unknown', () => {
    expect(resolvePlaybackMode('', undefined)).toBe('embedded');
  });
});

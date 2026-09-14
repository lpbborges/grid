import { describe, it, expect } from 'vitest';
import { endpoints, resolveEndpoints } from './endpoints';

const REAL = {
  cinemeta: 'https://v3-cinemeta.strem.io',
  moviesApi: 'https://movies-api.accel.li/api/v2',
  torrentio: 'https://torrentio.strem.fun',
  openSubtitles: 'https://opensubtitles-v3.strem.io',
  googleTranslate: 'https://translate.googleapis.com',
  myMemory: 'https://api.mymemory.translated.net'
};

describe('endpoints', () => {
  it('uses the real services when no override is configured', () => {
    expect(resolveEndpoints(undefined)).toEqual(REAL);
    expect(resolveEndpoints('   ')).toEqual(REAL);
  });

  it('uses the real services in this build', () => {
    expect(endpoints).toEqual(REAL);
  });

  it('routes every service through a local mock when overridden', () => {
    expect(resolveEndpoints('http://127.0.0.1:47100/')).toEqual({
      cinemeta: 'http://127.0.0.1:47100/cinemeta',
      moviesApi: 'http://127.0.0.1:47100/moviesApi',
      torrentio: 'http://127.0.0.1:47100/torrentio',
      openSubtitles: 'http://127.0.0.1:47100/openSubtitles',
      googleTranslate: 'http://127.0.0.1:47100/googleTranslate',
      myMemory: 'http://127.0.0.1:47100/myMemory'
    });
  });

  it('refuses an override that is not a loopback mock', () => {
    expect(() => resolveEndpoints('https://evil.example.com')).toThrow(/127\.0\.0\.1/);
    expect(() => resolveEndpoints('http://localhost:47100')).toThrow(/127\.0\.0\.1/);
  });
});

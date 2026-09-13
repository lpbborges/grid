import { describe, it, expect } from 'vitest';
import { hasExtension } from './fileExtension';

describe('hasExtension', () => {
  it('matches regardless of case', () => {
    expect(hasExtension('Movie.MKV', ['.mp4', '.mkv'])).toBe(true);
    expect(hasExtension('Subs.PT.SRT', ['.srt', '.vtt'])).toBe(true);
    expect(hasExtension('movie.mp4', ['.mp4'])).toBe(true);
  });

  it('only matches the end of the name', () => {
    expect(hasExtension('movie.mkv.txt', ['.mkv'])).toBe(false);
    expect(hasExtension('readme.nfo', ['.srt', '.vtt'])).toBe(false);
  });
});

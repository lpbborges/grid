import { describe, expect, it } from 'vitest';
import { decodeFrame } from './decodeText';

describe('decodeFrame', () => {
  it('returns the final string at progress 1', () => {
    expect(decodeFrame('Preparando vídeo…', 1)).toBe('Preparando vídeo…');
  });

  it('keeps the length and spaces stable at every step', () => {
    const final = 'Quase pronto…';
    for (let p = 0; p < 1; p += 0.1) {
      const frame = decodeFrame(final, p, () => 0.5);
      expect(frame).toHaveLength(final.length);
      [...final].forEach((ch, i) => {
        if (ch === ' ') expect(frame[i]).toBe(' ');
      });
    }
  });

  it('reveals a growing prefix', () => {
    expect(decodeFrame('abcd', 0.5, () => 0).startsWith('ab')).toBe(true);
  });

  it('scrambles the unrevealed rest but keeps dots and ellipses', () => {
    expect(decodeFrame('ab.c…', 0, () => 0)).toBe('00.0…');
  });

  it('handles an empty string', () => {
    expect(decodeFrame('', 0.3)).toBe('');
  });
});

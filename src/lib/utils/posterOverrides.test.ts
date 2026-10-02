import { describe, expect, it } from 'vitest';
import { correctedPoster } from './posterOverrides';

describe('correctedPoster', () => {
  it('replaces the poster of a title metahub gets wrong', () => {
    expect(
      correctedPoster('tt0185906', 'https://images.metahub.space/poster/small/tt0185906/img')
    ).toContain('media-amazon.com');
  });

  it('keeps every other poster', () => {
    expect(correctedPoster('tt1', 'p.jpg')).toBe('p.jpg');
    expect(correctedPoster('tt1', undefined)).toBeUndefined();
  });
});

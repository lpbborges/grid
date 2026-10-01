import { describe, it, expect } from 'vitest';
import { isImdbId } from './imdb';

describe('isImdbId', () => {
  it('accepts IMDb title ids only', () => {
    expect(isImdbId('tt0111161')).toBe(true);
    expect(['tt', 'nm0000001', '../tt1', 'tt1/x', 1].some(isImdbId)).toBe(false);
  });
});

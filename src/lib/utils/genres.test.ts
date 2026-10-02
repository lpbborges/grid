import { describe, it, expect } from 'vitest';
import { genreName } from './genres';

describe('genreName', () => {
  it('names Cinemeta genres in pt-BR', () => {
    expect(genreName('Sci-Fi')).toBe('Ficção científica');
    expect(genreName('Horror')).toBe('Terror');
  });

  it('keeps a genre it does not know', () => {
    expect(genreName('Wuxia')).toBe('Wuxia');
  });
});

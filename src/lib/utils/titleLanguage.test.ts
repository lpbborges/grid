import { describe, it, expect } from 'vitest';
import { mapCountryToLanguage, mapLanguageWordToCode } from './titleLanguage';

describe('mapLanguageWordToCode', () => {
  it('turns the movie service language word into a code', () => {
    expect(mapLanguageWordToCode('English')).toBe('en');
    expect(mapLanguageWordToCode(' portuguese ')).toBe('pt');
  });

  it('keeps a word it does not know, and defaults to English when empty', () => {
    expect(mapLanguageWordToCode('klingon')).toBe('klingon');
    expect(mapLanguageWordToCode(undefined)).toBe('en');
  });
});

describe('mapCountryToLanguage', () => {
  it('maps the production country to its main language', () => {
    expect(mapCountryToLanguage('United States, Canada')).toBe('en');
    expect(mapCountryToLanguage('Japan')).toBe('ja');
    expect(mapCountryToLanguage('Brazil')).toBe('pt');
    expect(mapCountryToLanguage('Mexico')).toBe('es');
  });

  it('falls back to English', () => {
    expect(mapCountryToLanguage('Atlantis')).toBe('en');
    expect(mapCountryToLanguage(undefined)).toBe('en');
  });
});

import { describe, it, expect } from 'vitest';
import {
  findPreferredSubtitleIndex,
  getLanguageName,
  subtitleFileLanguage
} from './subtitleLanguage';

describe('findPreferredSubtitleIndex', () => {
  const sub = (lang: string, label: string) =>
    ({ id: label, url: `blob:${label}`, lang, label, group: 'Extra' }) as const;

  it('matches Portuguese by language code, preferring Brazilian variants', () => {
    const subs = [sub('eng', 'Inglês'), sub('por', 'Português'), sub('pob', 'Português BR')];
    expect(findPreferredSubtitleIndex(subs, 'pt')).toBe(2);
  });

  it('falls back to European Portuguese when no Brazilian track exists', () => {
    const subs = [sub('eng', 'Inglês'), sub('por', 'Português')];
    expect(findPreferredSubtitleIndex(subs, 'pt')).toBe(1);
  });

  it('prefers an embedded track over an external one of the same language', () => {
    const subs = [sub('pob', 'Externa'), { ...sub('pob', 'Embutida'), group: 'Embedded' as const }];
    expect(findPreferredSubtitleIndex(subs, 'pt')).toBe(1);
  });

  it('prefers an external Brazilian track over an embedded European one', () => {
    const subs = [{ ...sub('por', 'Embutida'), group: 'Embedded' as const }, sub('pob', 'Externa')];
    expect(findPreferredSubtitleIndex(subs, 'pt')).toBe(1);
  });

  it('matches English and Spanish by 2- or 3-letter codes, case-insensitively', () => {
    const subs = [sub('POR', 'Português'), sub('EN', 'Inglês'), sub('spa', 'Espanhol')];
    expect(findPreferredSubtitleIndex(subs, 'en')).toBe(1);
    expect(findPreferredSubtitleIndex(subs, 'es')).toBe(2);
  });

  it('does not match on label substrings of unknown-language torrent files', () => {
    // Torrent files without a language suffix get lang "Unknown" and their
    // filename as label; "Adapted" / "Spanglish" must not be mistaken for pt/es.
    const subs = [sub('Unknown', 'Adapted.2002.1080p'), sub('Unknown', 'Spanglish.Commentary')];
    expect(findPreferredSubtitleIndex(subs, 'pt')).toBe(-1);
    expect(findPreferredSubtitleIndex(subs, 'es')).toBe(-1);
  });

  it('returns -1 for "none" or an unsupported preference', () => {
    const subs = [sub('pob', 'Português BR')];
    expect(findPreferredSubtitleIndex(subs, 'none')).toBe(-1);
    expect(findPreferredSubtitleIndex(subs, 'fr')).toBe(-1);
  });
});

describe('getLanguageName', () => {
  it('names a known code in Portuguese', () => {
    expect(getLanguageName('eng')).toBe('Inglês');
    expect(getLanguageName(' POB ')).toBe('Português BR');
  });

  it('capitalises an unknown code, or gives null when strict', () => {
    expect(getLanguageName('xx')).toBe('Xx');
    expect(getLanguageName('xx', true)).toBeNull();
  });
});

describe('subtitleFileLanguage', () => {
  it('reads the language suffix of a subtitle file name', () => {
    expect(subtitleFileLanguage('Movie.2020.en.srt')).toBe('en');
    expect(subtitleFileLanguage('Subs/2_English.srt')).toBe('English');
  });

  it('tells Brazilian Portuguese apart', () => {
    expect(subtitleFileLanguage('Movie.pt-BR.srt')).toBe('pob');
    expect(subtitleFileLanguage('Movie.PTBR.forced.srt')).toBe('pob');
  });

  it('is Unknown when the name carries no language', () => {
    expect(subtitleFileLanguage('Movie.srt')).toBe('Unknown');
  });
});

import { describe, it, expect } from 'vitest';
import { resolvePreferredAudioTrack, type ParsedAudioTrack } from './audioTrack';

function track(label: string, overrides: Partial<ParsedAudioTrack> = {}): ParsedAudioTrack {
  return { index: 0, id: label, label, enabled: false, ...overrides };
}

describe('resolvePreferredAudioTrack', () => {
  it('returns -1 when there is no preference', () => {
    expect(resolvePreferredAudioTrack([track('Inglês')], undefined)).toBe(-1);
  });

  it("returns -1 when the preference is 'none'", () => {
    expect(resolvePreferredAudioTrack([track('Inglês')], 'none')).toBe(-1);
  });

  describe("preference === 'original'", () => {
    it('matches a track whose resolved language name matches originalLanguage', () => {
      const tracks = [track('Português'), track('Japonês')];
      expect(resolvePreferredAudioTrack(tracks, 'original', 'ja')).toBe(1);
    });

    it("falls back to a track whose label contains 'orig' when originalLanguage has no match", () => {
      const tracks = [track('Português'), track('Original (Faixa 2)')];
      expect(resolvePreferredAudioTrack(tracks, 'original', 'xx')).toBe(1);
    });

    it("falls back to the hardcoded original-language list when nothing matches and there's more than one track", () => {
      const tracks = [track('Português'), track('Coreano')];
      expect(resolvePreferredAudioTrack(tracks, 'original')).toBe(1);
    });

    it('falls back to the first non-Portuguese track as a last resort with multiple tracks', () => {
      const tracks = [track('Português'), track('Faixa Desconhecida')];
      expect(resolvePreferredAudioTrack(tracks, 'original')).toBe(1);
    });

    it('returns -1 with a single track and no match (no non-Portuguese fallback applies)', () => {
      const tracks = [track('Português')];
      expect(resolvePreferredAudioTrack(tracks, 'original')).toBe(-1);
    });

    it('prefers the originalLanguage match over the generic "orig" substring match', () => {
      const tracks = [track('Original (Faixa 1)'), track('Japonês')];
      expect(resolvePreferredAudioTrack(tracks, 'original', 'ja')).toBe(1);
    });
  });

  it("preference === 'pt' matches a Portuguese track by label substring", () => {
    const tracks = [track('Inglês'), track('Português')];
    expect(resolvePreferredAudioTrack(tracks, 'pt')).toBe(1);
  });

  it("preference === 'pt' prefers Brazilian Portuguese over European Portuguese", () => {
    // Two distinct languages: the subtitle preference already ranks Brazilian
    // first, and the dub should follow the same rule.
    expect(resolvePreferredAudioTrack([track('Português'), track('Português BR')], 'pt')).toBe(1);
    expect(
      resolvePreferredAudioTrack(
        [track('Portuguese (Portugal)'), track('Portuguese (Brazil)')],
        'pt'
      )
    ).toBe(1);
    expect(resolvePreferredAudioTrack([track('Inglês'), track('pt-BR')], 'pt')).toBe(1);
  });

  it("preference === 'pt' falls back to European Portuguese when there is no Brazilian track", () => {
    expect(resolvePreferredAudioTrack([track('Inglês'), track('Português')], 'pt')).toBe(1);
  });

  it("preference === 'en' matches an English track by label substring", () => {
    const tracks = [track('Português'), track('Inglês')];
    expect(resolvePreferredAudioTrack(tracks, 'en')).toBe(1);
  });

  it("preference === 'es' matches a Spanish track by label substring", () => {
    const tracks = [track('Português'), track('Espanhol')];
    expect(resolvePreferredAudioTrack(tracks, 'es')).toBe(1);
  });

  it('returns -1 for an unrecognized preference value', () => {
    const tracks = [track('Português'), track('Inglês')];
    expect(resolvePreferredAudioTrack(tracks, 'klingon')).toBe(-1);
  });

  it('returns -1 when no track matches the requested preference', () => {
    const tracks = [track('Português')];
    expect(resolvePreferredAudioTrack(tracks, 'en')).toBe(-1);
  });
});

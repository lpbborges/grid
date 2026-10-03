import { describe, it, expect } from 'vitest';
import type { NativeTrack } from '$lib/types';
import { nativeTrackLabel, resolveNativeTracks, withExternalLangs } from './nativeTracks';

function track(partial: Partial<NativeTrack> & { id: number; type: string }): NativeTrack {
  return {
    lang: null,
    title: null,
    codec: null,
    default: false,
    forced: false,
    external: false,
    selected: false,
    original: false,
    hearing_impaired: false,
    ...partial
  };
}

describe('nativeTrackLabel', () => {
  it('resolves the language code into the name the resolvers match on', () => {
    // resolvePreferredAudioTrack was extracted from VideoPlayer, where labels
    // were human-readable DOM labels, not codes.
    expect(nativeTrackLabel(track({ id: 1, type: 'audio', lang: 'en' }))).toContain('ngl');
  });

  it('does not repeat the language when the title only restates it', () => {
    // Releases title their tracks "German (Germany)"; next to "Alemão" that
    // reads as the language twice.
    expect(
      nativeTrackLabel(track({ id: 1, type: 'sub', lang: 'ger', title: 'German (Germany)' }))
    ).toBe('Alemão');
    expect(
      nativeTrackLabel(track({ id: 1, type: 'sub', lang: 'spa', title: 'Spanish (Spain)' }))
    ).toBe('Espanhol');
  });

  it('keeps a variant of the language itself, in Portuguese', () => {
    expect(
      nativeTrackLabel(track({ id: 1, type: 'sub', lang: 'spa', title: 'Spanish (Latin America)' }))
    ).toBe('Espanhol (Latino)');
    expect(nativeTrackLabel(track({ id: 1, type: 'sub', lang: 'chi', title: 'Simplified' }))).toBe(
      'Chinês (Simplificado)'
    );
  });

  it('shows no detail that is not a variant of the language', () => {
    // SDH and forced describe the track, not the language; tracks that end
    // up with the same label are told apart as "Opção 1 / Opção 2".
    expect(nativeTrackLabel(track({ id: 1, type: 'sub', lang: 'en', title: 'English SDH' }))).toBe(
      'Inglês'
    );
    expect(
      nativeTrackLabel(track({ id: 1, type: 'sub', lang: 'en', title: 'Forced', forced: true }))
    ).toBe('Inglês');
    expect(
      nativeTrackLabel(track({ id: 1, type: 'sub', lang: 'en', hearing_impaired: true }))
    ).toBe('Inglês');
  });

  it('tells Brazilian from European Portuguese, as two languages', () => {
    // Matroska often tags both "por" and only the title says which one it is;
    // newer files carry the region in the tag itself.
    const label = (lang: string, title: string | null = null) =>
      nativeTrackLabel(track({ id: 1, type: 'sub', lang, title }));
    expect(label('por', 'Portuguese (Brazil)')).toBe('Português BR');
    expect(label('por', 'Brazilian')).toBe('Português BR');
    expect(label('por', 'Português (BR)')).toBe('Português BR');
    expect(label('pt-BR')).toBe('Português BR');
    expect(label('por', 'Portuguese (Portugal)')).toBe('Português');
    expect(label('pt-PT')).toBe('Português');
    expect(label('por')).toBe('Português');
  });

  it('drops a region that is not a variant of the language', () => {
    const label = (lang: string, title: string | null = null) =>
      nativeTrackLabel(track({ id: 1, type: 'sub', lang, title }));
    expect(label('en-US')).toBe('Inglês');
    expect(label('de-DE', 'German (Germany)')).toBe('Alemão');
    // A region that is a variant still names it.
    expect(label('es-419')).toBe('Espanhol (Latino)');
    expect(label('fr-CA')).toBe('Francês (Canadá)');
  });

  it('names languages missing from the table in Portuguese', () => {
    expect(
      nativeTrackLabel(track({ id: 1, type: 'sub', lang: 'bg', title: 'Bulgarian (Bulgaria)' }))
    ).toBe('Búlgaro');
  });

  it('falls back to the title when mpv reports no language', () => {
    expect(nativeTrackLabel(track({ id: 1, type: 'audio', title: 'Commentary' }))).toBe(
      'Commentary'
    );
  });

  it('keeps an unrecognised language code as a usable label', () => {
    expect(nativeTrackLabel(track({ id: 1, type: 'audio', lang: 'zz' }))).toBe('Zz');
  });

  it('is empty when mpv reports neither a language nor a title', () => {
    expect(nativeTrackLabel(track({ id: 1, type: 'audio' }))).toBe('');
  });
});

describe('withExternalLangs', () => {
  it('names external subtitle tracks mpv reports no language for', () => {
    const tracks = [
      track({ id: 1, type: 'sub', lang: 'en' }),
      track({ id: 2, type: 'sub', external: true }),
      track({ id: 3, type: 'sub', external: true })
    ];

    const named = withExternalLangs(tracks, ['pob', 'eng']);

    // Without this the menu shows "Legenda 2" and "Legenda 3" and the user
    // cannot tell Portuguese from English.
    expect(named[1].lang).toBe('pob');
    expect(named[2].lang).toBe('eng');
    // The embedded track already had one and keeps it.
    expect(named[0].lang).toBe('en');
  });

  it('leaves audio tracks and unmatched externals alone', () => {
    const tracks = [
      track({ id: 1, type: 'audio', external: true }),
      track({ id: 2, type: 'sub', external: true })
    ];

    const named = withExternalLangs(tracks, []);

    expect(named[0].lang).toBeNull();
    expect(named[1].lang).toBeNull();
  });
});

describe('resolveNativeTracks', () => {
  const tracks = [
    track({ id: 1, type: 'video', codec: 'hevc' }),
    track({ id: 1, type: 'audio', lang: 'en', selected: true }),
    track({ id: 2, type: 'audio', lang: 'pt' }),
    track({ id: 1, type: 'sub', lang: 'en' }),
    track({ id: 2, type: 'sub', lang: 'pt' })
  ];

  it('uses mpv per-type ids, not a flat index across all tracks', () => {
    const { aid, sid } = resolveNativeTracks(tracks, { audio: 'pt', subtitle: 'pt' });
    // Both are the second of their own type, so both are id 2 - a flat index
    // would have produced 2 and 4 here.
    expect(aid).toBe(2);
    expect(sid).toBe(2);
  });

  it('keeps the track mpv already selected when no audio preference matches', () => {
    // Sending null would be mpv's `no` sentinel, which mutes the film.
    const { aid } = resolveNativeTracks(tracks, { audio: 'none', subtitle: 'none' });
    expect(aid).toBe(1);
  });

  it('never returns null audio while the file has an audio track', () => {
    const { aid } = resolveNativeTracks(tracks, { audio: 'zz-nonexistent', subtitle: 'none' });
    expect(aid).not.toBeNull();
  });

  it('disables subtitles when nothing matches, as the <video> path does', () => {
    const { sid } = resolveNativeTracks(tracks, { audio: 'en', subtitle: 'none' });
    expect(sid).toBeNull();
  });

  it('matches external subtitle languages back on by position', () => {
    // mpv reports no `lang` for a file passed with --sub-file, so the languages
    // Grid wrote are matched back on by the order it passed them.
    const withExternal = [
      track({ id: 1, type: 'audio', lang: 'en', selected: true }),
      track({ id: 1, type: 'sub', lang: 'en' }),
      track({ id: 2, type: 'sub', external: true }),
      track({ id: 3, type: 'sub', external: true })
    ];

    const { sid } = resolveNativeTracks(withExternalLangs(withExternal, ['fr', 'pob']), {
      audio: 'en',
      subtitle: 'pt'
    });

    // The second external file is the Portuguese one.
    expect(sid).toBe(3);
  });

  it('does not mistake an embedded track for an external one when matching', () => {
    const withExternal = [
      track({ id: 1, type: 'sub', lang: 'pob' }),
      track({ id: 2, type: 'sub', external: true })
    ];

    const { sid } = resolveNativeTracks(withExternalLangs(withExternal, ['fr']), {
      audio: 'en',
      subtitle: 'pt'
    });

    // The embedded Portuguese track wins; the external one is French.
    expect(sid).toBe(1);
  });

  it('picks Brazilian Portuguese for the pt preference even when both are tagged "por"', () => {
    const portuguese = [
      track({ id: 1, type: 'audio', lang: 'por', title: 'Portuguese (Portugal)', selected: true }),
      track({ id: 2, type: 'audio', lang: 'por', title: 'Portuguese (Brazil)' }),
      track({ id: 1, type: 'sub', lang: 'por', title: 'Portuguese (Portugal)' }),
      track({ id: 2, type: 'sub', lang: 'por', title: 'Portuguese (Brazil)' })
    ];

    expect(resolveNativeTracks(portuguese, { audio: 'pt', subtitle: 'pt' })).toEqual({
      aid: 2,
      sid: 2
    });
  });

  it('matches a region-tagged track to its language preference', () => {
    // The en preference accepts "eng"/"en"; a track tagged "en-US" is still English.
    const tagged = [
      track({ id: 1, type: 'sub', lang: 'fre' }),
      track({ id: 2, type: 'sub', lang: 'en-US' })
    ];
    expect(resolveNativeTracks(tagged, { audio: 'none', subtitle: 'en' }).sid).toBe(2);
  });

  it('copes with a file that has no audio or subtitle tracks at all', () => {
    const videoOnly = [track({ id: 1, type: 'video' })];
    expect(resolveNativeTracks(videoOnly, { audio: 'pt', subtitle: 'pt' })).toEqual({
      aid: null,
      sid: null
    });
  });
});

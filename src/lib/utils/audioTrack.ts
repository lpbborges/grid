import { getLanguageName } from '$lib/api/subtitles';

export interface ParsedAudioTrack {
  index: number;
  id: string;
  label: string;
  enabled: boolean;
}

/**
 * Index (into `tracks`) of the audio track that best matches a stored
 * preference ('original' | 'pt' | 'en' | 'es'), or -1 when there is no
 * match, the preference is 'none'/unset, or unrecognized.
 *
 * Mirrors `findPreferredSubtitleIndex` in `$lib/api/subtitles`: a pure,
 * independently testable function extracted out of
 * `VideoPlayer.svelte`'s `handleLoadedMetadata`, preserving its exact
 * fallback chain for the 'original' preference:
 *   1. a track whose resolved language name matches `originalLanguage`
 *   2. a track whose label literally contains "orig"
 *   3. (only when there's more than one track) a track in one of a
 *      hardcoded list of common original-audio languages
 *   4. (still within #3) the first track that isn't Portuguese
 */
export function resolvePreferredAudioTrack(
  tracks: ParsedAudioTrack[],
  preference: string | undefined,
  originalLanguage?: string
): number {
  if (!preference || preference === 'none') return -1;

  if (preference === 'original') {
    if (originalLanguage) {
      const originalName = getLanguageName(originalLanguage, true);
      if (originalName) {
        const idx = tracks.findIndex((t) =>
          t.label.toLowerCase().includes(originalName.toLowerCase())
        );
        if (idx !== -1) return idx;
      }
    }

    const origIdx = tracks.findIndex((t) => t.label.toLowerCase().includes('orig'));
    if (origIdx !== -1) return origIdx;

    if (tracks.length > 1) {
      const origLangs = ['ingl', 'eng', 'japon', 'jpn', 'corean', 'kor'];
      for (const lang of origLangs) {
        const idx = tracks.findIndex((t) => t.label.toLowerCase().includes(lang));
        if (idx !== -1) return idx;
      }
      const notPtIdx = tracks.findIndex((t) => !t.label.toLowerCase().includes('portug'));
      if (notPtIdx !== -1) return notPtIdx;
    }
    return -1;
  }

  if (preference === 'pt') {
    // Brazilian and European Portuguese are two languages: Brazilian first,
    // European only when there is no Brazilian dub - the same order
    // findPreferredSubtitleIndex uses for the 'pt' subtitle preference.
    const isPortuguese = (t: ParsedAudioTrack) =>
      t.label.toLowerCase().includes('portug') || t.label.toLowerCase().includes('pt');
    const isBrazilian = (t: ParsedAudioTrack) => /\bbr\b|bras|brazil|pt-?br/i.test(t.label);
    const brazilian = tracks.findIndex((t) => isPortuguese(t) && isBrazilian(t));
    return brazilian !== -1 ? brazilian : tracks.findIndex(isPortuguese);
  }
  if (preference === 'en') {
    return tracks.findIndex(
      (t) => t.label.toLowerCase().includes('ingl') || t.label.toLowerCase().includes('eng')
    );
  }
  if (preference === 'es') {
    return tracks.findIndex(
      (t) => t.label.toLowerCase().includes('espanh') || t.label.toLowerCase().includes('spa')
    );
  }

  return -1;
}

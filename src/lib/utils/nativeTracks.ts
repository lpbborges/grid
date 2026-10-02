import type { NativeTrack } from '$lib/types';
import { findPreferredSubtitleIndex, getLanguageName } from '$lib/api/subtitles';
import type { SubtitleTrack } from '$lib/api/subtitles';
import { resolvePreferredAudioTrack, type ParsedAudioTrack } from '$lib/utils/audioTrack';

/**
 * The label `resolvePreferredAudioTrack` matches against (it expects
 * human-readable language names, not codes), also shown in the audio and
 * subtitle menus.
 */
export function nativeTrackLabel(track: NativeTrack): string {
  const code = trackLanguage(track);
  // Without a language the release's own title is all there is to go on.
  if (!code) return track.title?.trim() ?? '';

  const language = languageName(code);
  // Titles mostly restate the language ("German (Germany)"), so only a variant
  // of the language itself is shown, never SDH or forced. Tracks that still
  // share a label are grouped as "Opção 1 / Opção 2". The region counts:
  // "es-419" is Latin American Spanish.
  const source = `${track.title ?? ''} ${track.lang ?? ''}`;
  const variant = LANGUAGE_VARIANTS.find(([pattern]) => pattern.test(source))?.[1];
  // A table entry like "Espanhol (América Latina)" already names its variant.
  return variant && !language.includes('(') ? `${language} (${variant})` : language;
}

/** Variants of a language a release title can name, as the menus show them. */
const LANGUAGE_VARIANTS: [RegExp, string][] = [
  [/latin|latino|latam|419|mexic/i, 'Latino'],
  [/canad|-ca\b/i, 'Canadá'],
  [/simplified|\bhans\b/i, 'Simplificado'],
  [/traditional|\bhant\b/i, 'Tradicional']
];

/**
 * The track's language code, with Brazilian and European Portuguese told
 * apart: they are two languages, not a variant of one. Any other region tag
 * ("en-US", "es-419") is reduced to its language, which is what the menus
 * name and the preferences match on; nativeTrackLabel still reads the region
 * for a variant.
 *
 * Matroska often tags both "por" and only the title says which one it is;
 * newer files carry the region in the tag ("pt-BR", "pt-PT"). Brazilian comes
 * back as "pob" and European as "por" - the codes getLanguageName names
 * "Português BR" and "Português", and the 'pt' subtitle preference ranks
 * Brazilian first.
 */
export function trackLanguage(track: NativeTrack): string | null {
  if (!track.lang) return null;
  const code = track.lang.toLowerCase().replace('_', '-');
  if (['pob', 'pb', 'ptbr', 'pt-br'].includes(code)) return 'pob';
  if (code === 'pt-pt') return 'por';
  if (
    (code === 'por' || code === 'pt') &&
    /brazil|brasil|\bpt-?br\b|\(br\)/i.test(track.title ?? '')
  ) {
    return 'pob';
  }
  const [base] = code.split('-');
  return base !== code ? base : track.lang;
}

/**
 * Grid's own Portuguese names first (they match what the preference resolvers
 * expect), then the platform's for everything the table lacks - "bg" becomes
 * "Búlgaro" rather than "Bg".
 */
function languageName(code: string): string {
  const known = getLanguageName(code, true);
  if (known) return known;
  try {
    const name = new Intl.DisplayNames(['pt-BR'], { type: 'language' }).of(code);
    if (name && name.toLowerCase() !== code.toLowerCase()) {
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
  } catch {
    // Not a valid language tag; fall through to the capitalised code.
  }
  // Non-strict getLanguageName never returns null: an unrecognised code comes
  // back capitalised, which is still a usable label.
  return getLanguageName(code) ?? code;
}

/**
 * mpv's per-type track ids for the audio and subtitle tracks that best match the
 * stored preferences, reusing the same resolvers the `<video>` path uses. Pass
 * the tracks through `withExternalLangs` first, so external subtitles carry a language.
 *
 * `null` means mpv's `no` sentinel. For audio that would mute the film, so when
 * nothing matches the track mpv already selected is kept instead. For subtitles
 * `null` is correct: no match means no subtitles, exactly as on Linux.
 */
export function resolveNativeTracks(
  tracks: NativeTrack[],
  preferences: { audio: string | undefined; subtitle: string | undefined },
  originalLanguage?: string
): { aid: number | null; sid: number | null } {
  const audio = tracks.filter((t) => t.type === 'audio');
  const subs = tracks.filter((t) => t.type === 'sub');

  const parsedAudio: ParsedAudioTrack[] = audio.map((track, index) => ({
    index,
    id: String(track.id),
    label: nativeTrackLabel(track),
    enabled: track.selected
  }));
  const audioMatch = resolvePreferredAudioTrack(parsedAudio, preferences.audio, originalLanguage);
  const selectedAudio = audio.find((t) => t.selected) ?? audio[0];
  const aid = audioMatch !== -1 ? audio[audioMatch].id : (selectedAudio?.id ?? null);

  const parsedSubs: SubtitleTrack[] = subs.map((track) => ({
    id: String(track.id),
    url: '',
    lang: trackLanguage(track) ?? '',
    label: nativeTrackLabel(track),
    group: track.external ? 'Extra' : 'Embedded'
  }));
  const subMatch = findPreferredSubtitleIndex(parsedSubs, preferences.subtitle ?? 'none');
  const sid = subMatch !== -1 ? subs[subMatch].id : null;

  return { aid, sid };
}

/**
 * Fills in the language of every external subtitle track. mpv reports no `lang`
 * for a `--sub-file` track, and lists them in the order given, so Grid's
 * languages are matched back on by position.
 */
export function withExternalLangs(tracks: NativeTrack[], externalLangs: string[]): NativeTrack[] {
  let seen = 0;
  return tracks.map((track) => {
    if (track.type !== 'sub' || !track.external) return track;
    const lang = externalLangs[seen++];
    return lang && !track.lang ? { ...track, lang } : track;
  });
}

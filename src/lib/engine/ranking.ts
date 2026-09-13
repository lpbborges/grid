/**
 * Shared torrent/stream ranking logic used by both the movie and series
 * pages to pick the best available stream for the user's quality/audio
 * preferences. Previously this scoring logic was copy-pasted and diverged
 * between the two pages (movie page: exact quality match, dubbed-only vs.
 * dual-audio distinction, original-audio penalty, seed tiebreak; series
 * page: substring quality match, none of the audio nuance, no tiebreak).
 * This module unifies both call sites on the more correct (movie-page)
 * behavior.
 */

/** A user's audio preference, as stored in `settingsStore.audio`. */
export type AudioPreference = 'pt' | 'original' | string;

/** The minimal, page-agnostic shape a stream option needs to be ranked. */
export interface StreamRankingInput {
  /**
   * Video quality label (e.g. '1080p', '4k'), compared with an exact match
   * against the preferred quality. Both current callers (movie and series
   * pages) derive this the same way — matching `/(4k|1080p|720p|480p)/i`
   * against the stream name — but this function doesn't enforce that; a
   * future caller with a different quality source would still need to
   * normalize to one of these labels for the exact-match scoring to work.
   */
  quality: string;
  /** Lower-cased blob of all searchable text for this option (title + name + any type label), used for the dubbed/dual/original-language heuristics. */
  text: string;
  /** Seed count, used only as a tiebreaker between options with equal scores (not part of the score). */
  seeds: number;
}

export interface RankStreamOptionsParams {
  quality: string;
  audioPreference: AudioPreference;
}

/** A stream option paired with the score it was ranked with. */
export interface RankedTorrentOption<T> {
  option: T;
  score: number;
}

/**
 * Scores a single stream option against the user's quality/audio
 * preferences. Higher is better. `input.text` must already be lower-cased
 * by the caller (both dubbed-audio markers and the literal "(pt)" marker
 * are matched case-sensitively against it).
 */
export function scoreStreamOption(
  input: StreamRankingInput,
  params: RankStreamOptionsParams
): number {
  let score = 0;
  const text = input.text;

  if (input.quality === params.quality) score += 100;

  const wantPt = params.audioPreference === 'pt';
  const wantOriginal = params.audioPreference === 'original';

  const isDubbedOnly = text.includes('dublado') && !text.includes('dual');
  const isDual = text.includes('dual audio') || text.includes('multi-audio');
  const hasPt =
    isDubbedOnly ||
    isDual ||
    text.includes('pt-br') ||
    text.includes('🇧🇷') ||
    text.includes('(pt)');

  if (wantPt) {
    if (hasPt) score += 500;
    else score += 10;
  } else if (wantOriginal) {
    if (isDubbedOnly) score -= 500;
    else score += 500;
  } else {
    if (!isDubbedOnly) score += 100;
  }

  return score;
}

/**
 * Ranks `options` best-first according to `params`, without mutating the
 * input array. `toRankingInput` adapts a page's own option shape (torrent,
 * torrentio stream, etc.) into the generic `StreamRankingInput` the scoring
 * function understands. Options with equal scores are ordered by seed count,
 * and options tied on both keep their input order.
 */
export function rankStreamOptions<T>(
  options: T[],
  toRankingInput: (option: T) => StreamRankingInput,
  params: RankStreamOptionsParams
): T[] {
  return options
    .map((option) => {
      const input = toRankingInput(option);
      return { option, score: scoreStreamOption(input, params), seeds: input.seeds || 0 };
    })
    .sort((a, b) => b.score - a.score || b.seeds - a.seeds)
    .map(({ option }) => option);
}

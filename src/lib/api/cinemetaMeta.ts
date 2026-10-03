import type { CinemetaMeta, Movie } from '../types';
import { isRecord } from '$lib/utils/isRecord';
import { correctedPoster } from '$lib/utils/posterOverrides';

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export function isCinemetaMeta(value: unknown): value is CinemetaMeta {
  return isRecord(value) && typeof value.name === 'string' && value.name !== '';
}

export function entriesOf(data: unknown): unknown[] {
  return isRecord(data) && Array.isArray(data.metas) ? data.metas : [];
}

/** Genres, runtime and trailer, each left out when Cinemeta has nothing usable. */
export function cinemetaExtras(
  meta: CinemetaMeta
): Pick<Movie, 'genres' | 'runtime' | 'trailerYoutubeId'> {
  const genres = Array.isArray(meta.genres)
    ? meta.genres.filter((genre): genre is string => typeof genre === 'string')
    : [];
  const trailer = Array.isArray(meta.trailers)
    ? meta.trailers.find(
        (t) => isRecord(t) && typeof t.source === 'string' && YOUTUBE_ID.test(t.source)
      )
    : undefined;
  return {
    ...(genres.length > 0 && { genres }),
    ...(typeof meta.runtime === 'string' && meta.runtime && { runtime: meta.runtime }),
    ...(isRecord(trailer) && { trailerYoutubeId: String(trailer.source) })
  };
}

export function mapCinemetaMeta(m: CinemetaMeta): Movie {
  const id = m.imdb_id || m.id || '';
  const poster = correctedPoster(id, m.poster);
  return {
    id,
    title: m.name,
    year: parseInt(m.year || m.releaseInfo || '') || 0,
    ...(typeof m.released === 'string' && m.released && { releaseDate: m.released }),
    rating: parseFloat(m.imdbRating || '') || 0,
    medium_cover_image: poster,
    large_cover_image: poster,
    background_image_original: m.background,
    summary: m.description || '',
    description_full: m.description || '',
    torrents: []
  };
}

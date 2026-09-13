export interface Torrent {
  url: string;
  hash: string;
  quality: string;
  type: string;
  seeds: number;
  peers: number;
  size: string;
}

export interface CastMember {
  name: string;
  character_name: string;
  url_small_image: string | null;
  imdb_code: string;
}

export interface Movie {
  id: string | number;
  title: string;
  year: number;
  rating: number;
  medium_cover_image: string;
  large_cover_image: string;
  background_image?: string;
  background_image_original?: string;
  summary: string;
  description_full: string;
  torrents: Torrent[];
  cast?: CastMember[];
  director?: string[];
  language?: string;
}

export interface Episode {
  id: string;
  season: number;
  episode: number;
  name?: string;
  firstAired?: string;
}

export interface Series extends Movie {
  videos: Episode[];
}

/** A Cinemeta `meta` object, as returned by its catalog and meta endpoints. */
export interface CinemetaMeta {
  id?: string;
  imdb_id?: string;
  name: string;
  year?: string;
  releaseInfo?: string;
  imdbRating?: string;
  poster: string;
  background?: string;
  description?: string;
  cast?: string[];
  director?: string[];
  country?: string;
  videos?: Episode[];
}

/** A user's audio preference, as stored in `settingsStore.audio`. */
export type AudioPreference = 'pt' | 'original' | 'en' | 'es';

export const AUDIO_PREFERENCES: readonly AudioPreference[] = ['pt', 'original', 'en', 'es'];

export function isAudioPreference(value: string): value is AudioPreference {
  return (AUDIO_PREFERENCES as readonly string[]).includes(value);
}

/** One entry of the OpenSubtitles (strem.io) addon's `subtitles` response array. */
export interface ExternalSubtitleEntry {
  id: string;
  url: string;
  lang: string;
}

export interface TorrentEngineDetails {
  info_hash: string;
  files: {
    name: string;
    length: number;
  }[];
}

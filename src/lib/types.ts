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
  /** Cinemeta's English genre names, see `genreName`. */
  genres?: string[];
  /** Cinemeta's runtime text, e.g. "136 min". */
  runtime?: string;
  trailerYoutubeId?: string;
}

export type MediaType = 'movie' | 'series';

/** A search hit, which may be a movie or a series. */
export interface SearchResult extends Movie {
  type: MediaType;
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

export interface ProgressMeta {
  type: MediaType;
  title: string;
  poster: string;
}

export interface EpisodeRef {
  season: number;
  episode: number;
}

/** What the page playing a title tells the progress store about it. */
export interface ProgressContext {
  meta: ProgressMeta;
  next?: EpisodeRef | null;
}

/** Saved playback position of a title or episode. */
export interface ProgressData {
  time: number;
  duration: number;
  updatedAt: number;
  meta?: ProgressMeta;
  /** Set on the next episode when the previous one finishes, until it is played. */
  upNext?: true;
}

/** One title's most recent progress, as listed in Continuar assistindo. */
export interface ProgressEntry extends ProgressData {
  id: string;
  season?: number;
  episode?: number;
}

/** The fields MediaCard needs from any title. */
export type CardMedia = Pick<Movie, 'id' | 'title' | 'medium_cover_image'>;

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
  genres?: unknown;
  runtime?: unknown;
  trailers?: unknown;
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
  movieReleaseName?: unknown;
  subtitleFileName?: unknown;
}

export interface TorrentEngineDetails {
  info_hash: string;
  files: {
    name: string;
    length: number;
  }[];
}

import type { SubtitleTrack } from '$lib/api/subtitles';
import type { ParsedAudioTrack } from '$lib/utils/audioTrack';

/** Everything a backend needs to start one stream. */
export interface PlaybackRequest {
  url: string;
  subtitles: SubtitleTrack[];
  mediaId: string | number;
  season?: number;
  episode?: number;
  startSeconds: number;
  originalLanguage?: string;
  /** mpv only: closed for any reason, including errors. */
  onended?: () => void;
  /** The file played to its end. Never called on close or error. */
  onfinished?: () => void;
}

/**
 * One playback backend: a `<video>` element (macOS), or libmpv running
 * in-process (Linux and Windows).
 *
 * The shape is the one `PlayerControls` already consumes, plus lifecycle.
 * Track selection is index-based on both sides on purpose: mpv numbers tracks
 * per type, and letting an mpv id reach a component silently selects the wrong
 * track. Mapping an index to whatever the backend uses is the backend's job.
 */
/** Where a chapter of the file starts, from mpv's `chapter-list`. */
export interface Chapter {
  title: string | null;
  time: number;
}

export interface PlayerBackend {
  readonly currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  readonly volume: number;
  /** Latched once a frame has been painted. Gates the opaque loading overlay. */
  readonly hasStarted: boolean;
  /** Stalled after playback began: the translucent overlay, not the opaque one. */
  readonly buffering: boolean;
  readonly error: string;

  readonly audioTracks: ParsedAudioTrack[];
  readonly activeAudioIndex: number;
  readonly subtitles: SubtitleTrack[];
  readonly activeSubtitleIndex: number;
  /** DOM-only. Always `[]` for mpv, which reports no per-track failures. */
  readonly failedSubtitleIndexes: number[];
  /** DOM-only. Always `''` for mpv. */
  readonly subtitleError: string;
  /** mpv-only. Always `[]` for the DOM backend, which cannot read chapters. */
  readonly chapters: Chapter[];

  start(request: PlaybackRequest): Promise<boolean>;
  stop(): Promise<void>;
  togglePlay(): void | Promise<void>;
  seek(seconds: number): void | Promise<void>;
  setVolume(value: number): void | Promise<void>;
  selectAudio(index: number): void | Promise<void>;
  selectSubtitle(index: number): void | Promise<void>;
  /** DOM: element fullscreen. mpv: the Tauri window's. */
  toggleFullscreen(): void | Promise<void>;
  /** Lifts the subtitles above whatever the shell draws over the bottom of the picture. */
  syncOverlayLayout(controlsVisible: boolean, menusOpen: boolean, cardVisible: boolean): void;
}

/** What the player's next episode card shows and does. */
export interface UpNextCard {
  /** e.g. "T1:E2 · Segundo" */
  title: string;
  secondsLeft: number;
  onplay: () => void;
  oncancel: () => void;
}

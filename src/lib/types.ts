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
  onended?: () => void;
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

  start(request: PlaybackRequest): Promise<boolean>;
  stop(): Promise<void>;
  togglePlay(): void | Promise<void>;
  seek(seconds: number): void | Promise<void>;
  setVolume(value: number): void | Promise<void>;
  selectAudio(index: number): void | Promise<void>;
  selectSubtitle(index: number): void | Promise<void>;
  /** DOM: element fullscreen. mpv: the Tauri window's. */
  toggleFullscreen(): void | Promise<void>;
  /**
   * The shell owns menu visibility, and the DOM backend has to lift subtitle
   * cues above an open menu. Empty for mpv, which renders its own cues.
   */
  syncOverlayLayout(controlsVisible: boolean, menusOpen: boolean): void;
}

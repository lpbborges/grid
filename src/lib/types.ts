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

export interface TorrentEngineDetails {
  info_hash: string;
  files: {
    name: string;
    length: number;
  }[];
}

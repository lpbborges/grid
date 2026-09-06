export interface Torrent {
  url: string;
  hash: string;
  quality: string;
  type: string;
  seeds: number;
  peers: number;
  size: string;
}

export interface Movie {
  id: number;
  title: string;
  year: number;
  rating: number;
  medium_cover_image: string;
  large_cover_image: string;
  summary: string;
  description_full: string;
  torrents: Torrent[];
}

export interface TorrentEngineDetails {
  info_hash: string;
  files: {
    name: string;
    length: number;
  }[];
}

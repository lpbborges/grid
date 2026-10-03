import { parseSeedCount, type Stream } from '$lib/api/torrentio';

/** A source the user can pick, from the movie service or from Torrentio. */
export interface StreamOption {
  hash: string;
  quality: string;
  type: string;
  seeds?: number;
  peers?: number;
  url?: string;
  rawStream?: Stream;
}

/** The resolution a stream name advertises, or 'unknown'. */
export function qualityOf(name: string | undefined): string {
  const match = name?.match(/(4k|1080p|720p|480p)/i);
  return match ? match[1].toLowerCase() : 'unknown';
}

export function streamOption(stream: Stream): StreamOption {
  const title = (stream.title || '').toLowerCase();
  let type = 'Torrentio';
  if (title.includes('dublado') || title.includes('pt-br') || title.includes('🇧🇷')) {
    type += ' (PT)';
  } else if (title.includes('dual')) {
    type += ' (Dual)';
  }
  return {
    hash: stream.infoHash ?? '',
    quality: qualityOf(stream.name),
    type,
    seeds: parseSeedCount(stream.title),
    rawStream: stream
  };
}

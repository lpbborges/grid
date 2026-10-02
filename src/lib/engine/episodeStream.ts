import { logger } from '$lib/logger';
import { buildMagnet, getSeriesStreams, parseSeedCount, type Stream } from '$lib/api/torrentio';
import { rankStreamOptions } from '$lib/engine/ranking';
import { qualityOf } from '$lib/engine/streamOption';
import type { AudioPreference, EpisodeRef } from '$lib/types';
import type { PageError } from '$lib/utils/pageError';

export type EpisodeStream =
  { magnet: string; fileIdx?: number; infoHash: string } | { error: PageError };

const UNAVAILABLE: PageError = {
  message: 'Este episódio ainda não está disponível para assistir.',
  action: 'back'
};

/** Finds the best ranked source for one episode, skipping `failed` info hashes. */
export async function findEpisodeStream(
  series: { id: string; title: string },
  episode: EpisodeRef,
  preferences: { quality: string; audio: AudioPreference; subtitle: string },
  failed: ReadonlySet<string> = new Set()
): Promise<EpisodeStream> {
  try {
    const streams = await getSeriesStreams(series.id, episode.season, episode.episode, preferences);
    const playable = streams.filter((s): s is Stream & { infoHash: string } => !!s.infoHash);
    if (playable.length === 0) return { error: UNAVAILABLE };

    const rankableStreams = playable.filter((s) => !failed.has(s.infoHash));
    if (rankableStreams.length === 0) {
      return {
        error: {
          message: 'Não encontramos outra fonte que funcione para este episódio.',
          action: 'back'
        }
      };
    }

    const sorted = rankStreamOptions(
      rankableStreams,
      (s) => {
        const text = ((s.title || '') + ' ' + (s.name || '')).toLowerCase();
        return { quality: qualityOf(s.name), text, seeds: parseSeedCount(s.title) };
      },
      { quality: preferences.quality, audioPreference: preferences.audio }
    );

    const bestStream = sorted[0];

    return {
      infoHash: bestStream.infoHash,
      magnet: buildMagnet(
        bestStream.infoHash,
        `${series.title} S${episode.season}E${episode.episode}`,
        bestStream.sources
      ),
      fileIdx: bestStream.fileIdx
    };
  } catch (e) {
    logger.error('Erro ao buscar fontes do episódio:', e);
    return {
      error: {
        message: 'Não foi possível buscar este episódio. Verifique sua conexão.',
        action: 'retry'
      }
    };
  }
}

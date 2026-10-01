import { logger } from '$lib/logger';
import { buildMagnet, getSeriesStreams, parseSeedCount } from '$lib/api/torrentio';
import { rankStreamOptions } from '$lib/engine/ranking';
import type { AudioPreference, EpisodeRef } from '$lib/types';

export type EpisodeStream = { magnet: string; fileIdx?: number } | { error: string };

/** Finds the best ranked source for one episode and builds its magnet. */
export async function findEpisodeStream(
  series: { id: string; title: string },
  episode: EpisodeRef,
  preferences: { quality: string; audio: AudioPreference }
): Promise<EpisodeStream> {
  try {
    const streams = await getSeriesStreams(series.id, episode.season, episode.episode);
    if (!streams || streams.length === 0) {
      return { error: 'Nenhuma fonte encontrada para este episódio.' };
    }

    const rankableStreams = streams.filter((s) => s.infoHash);

    const sorted = rankStreamOptions(
      rankableStreams,
      (s) => {
        const text = ((s.title || '') + ' ' + (s.name || '')).toLowerCase();
        const qualityMatch = s.name?.match(/(4k|1080p|720p|480p)/i);
        const quality = qualityMatch ? qualityMatch[1].toLowerCase() : 'unknown';
        return { quality, text, seeds: parseSeedCount(s.title) };
      },
      { quality: preferences.quality, audioPreference: preferences.audio }
    );

    const bestStream = sorted[0];

    if (!bestStream || !bestStream.infoHash) {
      return { error: 'Fonte incompatível para este episódio.' };
    }

    return {
      magnet: buildMagnet(
        bestStream.infoHash,
        `${series.title} S${episode.season}E${episode.episode}`,
        bestStream.sources
      ),
      fileIdx: bestStream.fileIdx
    };
  } catch (e) {
    logger.error('Erro ao buscar fontes do episódio:', e);
    return { error: 'Não foi possível iniciar a reprodução. Tente novamente.' };
  }
}

import type { PageLoad } from './$types';
import { getSeriesDetails } from '$lib/api/cinemeta';
import { parseEpisodeParams, sameEpisode } from '$lib/utils/episodes';
import { progressStore } from '$lib/stores/progress.svelte';
import type { Episode, EpisodeRef } from '$lib/types';

function listed(videos: Episode[], ref: EpisodeRef | null): EpisodeRef | null {
  return ref && videos.some((v) => sameEpisode(v, ref)) ? ref : null;
}

export const load: PageLoad = async ({ fetch, params, url }) => {
  const seriesId = params.id;
  const requested = parseEpisodeParams(url.searchParams);
  try {
    const series = await getSeriesDetails(seriesId, fetch);
    const initialEpisode =
      listed(series.videos, requested) ??
      listed(series.videos, progressStore.latestEpisodeFor(seriesId));
    return {
      seriesId,
      series,
      initialEpisode,
      error: null
    };
  } catch (e) {
    return {
      seriesId,
      series: null,
      initialEpisode: null,
      error: (e instanceof Error && e.message) || 'Erro ao carregar série'
    };
  }
};

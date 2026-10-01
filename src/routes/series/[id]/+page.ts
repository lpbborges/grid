import type { PageLoad } from './$types';
import { getSeriesDetails } from '$lib/api/cinemeta';
import { parseEpisodeParams } from '$lib/utils/episodes';

export const load: PageLoad = async ({ fetch, params, url }) => {
  const seriesId = params.id;
  const requestedEpisode = parseEpisodeParams(url.searchParams);
  try {
    const series = await getSeriesDetails(seriesId, fetch);
    return {
      seriesId,
      series,
      requestedEpisode,
      error: null
    };
  } catch (e) {
    return {
      seriesId,
      series: null,
      requestedEpisode,
      error: (e instanceof Error && e.message) || 'Erro ao carregar série'
    };
  }
};

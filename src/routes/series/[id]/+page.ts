import type { PageLoad } from './$types';
import { getSeriesDetails } from '$lib/api/cinemeta';

export const load: PageLoad = async ({ fetch, params }) => {
  const seriesId = params.id;
  try {
    const series = await getSeriesDetails(seriesId, fetch);
    return {
      seriesId,
      series,
      error: null
    };
  } catch (e) {
    return {
      seriesId,
      series: null,
      error: (e instanceof Error && e.message) || 'Erro ao carregar série'
    };
  }
};

import type { Movie } from '../types';

const BASE_URL = 'https://movies-api.accel.li/api/v2';

export async function getPopularMovies(limit = 24): Promise<Movie[]> {
  try {
    const res = await fetch(`https://v3-cinemeta.strem.io/catalog/movie/top.json`);
    if (!res.ok) {
      throw new Error(`Failed to fetch popular movies from cinemeta: ${res.statusText}`);
    }
    const data = await res.json();
    const metas = data.metas || [];

    return metas
      .map((m: any) => ({
        id: m.imdb_id || m.id,
        title: m.name,
        year: parseInt(m.year) || 0,
        rating: parseFloat(m.imdbRating) || 0,
        medium_cover_image: m.poster,
        large_cover_image: m.poster,
        summary: m.description || '',
        description_full: m.description || '',
        torrents: []
      }))
      .slice(0, limit);
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function getPopularSeries(limit = 24): Promise<Movie[]> {
  try {
    // using cinemeta for popular series
    const res = await fetch(`https://v3-cinemeta.strem.io/catalog/series/top.json`);
    if (!res.ok) {
      throw new Error(`Failed to fetch popular series from cinemeta: ${res.statusText}`);
    }
    const data = await res.json();
    const metas = data.metas || [];

    return metas
      .map((m: any) => ({
        id: m.imdb_id || m.id,
        title: m.name,
        year: parseInt(m.year) || 0,
        rating: parseFloat(m.imdbRating) || 0,
        medium_cover_image: m.poster,
        large_cover_image: m.poster,
        summary: m.description || '',
        description_full: m.description || '',
        torrents: []
      }))
      .slice(0, limit);
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function getMovieDetails(movieId: number | string): Promise<Movie> {
  const isImdbId = typeof movieId === 'string' && movieId.startsWith('tt');
  const queryParam = isImdbId ? `imdb_id=${movieId}` : `movie_id=${movieId}`;
  const res = await fetch(`${BASE_URL}/movie_details.json?${queryParam}&with_cast=true`);
  if (!res.ok) {
    throw new Error(`Failed to fetch movie details: ${res.statusText}`);
  }
  const data = await res.json();
  if (data.status !== 'ok') {
    throw new Error(data.status_message || 'API returned an error');
  }
  const movie = data.data.movie;

  // Try to fetch director from cinemeta if we have an IMDB ID
  if (isImdbId || movie.imdb_code) {
    const imdbId = isImdbId ? movieId : movie.imdb_code;
    try {
      const cineRes = await fetch(`https://v3-cinemeta.strem.io/meta/movie/${imdbId}.json`);
      if (cineRes.ok) {
        const cineData = await cineRes.json();
        if (cineData?.meta?.director) {
          movie.director = cineData.meta.director;
        }
        if (cineData?.meta?.background) {
          movie.background_image_original = cineData.meta.background;
        }
      }
    } catch {
      // Ignore cinemeta fetch errors
    }
  }

  return movie;
}

export async function getSeriesDetails(seriesId: string): Promise<any> {
  const res = await fetch(`https://v3-cinemeta.strem.io/meta/series/${seriesId}.json`);
  if (!res.ok) {
    throw new Error(`Failed to fetch series details: ${res.statusText}`);
  }
  const data = await res.json();
  if (!data.meta) {
    throw new Error('API returned an error');
  }

  const meta = data.meta;
  return {
    id: meta.imdb_id || meta.id,
    title: meta.name,
    year: parseInt(meta.year) || 0,
    rating: parseFloat(meta.imdbRating) || 0,
    medium_cover_image: meta.poster,
    large_cover_image: meta.poster,
    background_image_original: meta.background,
    summary: meta.description || '',
    description_full: meta.description || '',
    cast: (meta.cast || []).map((c: string) => ({
      name: c,
      character_name: '',
      url_small_image: null,
      imdb_code: ''
    })),
    director: meta.director || [],
    videos: meta.videos || [],
    torrents: []
  };
}

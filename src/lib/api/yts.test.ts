import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getPopularMovies,
  getMovieDetails,
  getPopularSeries,
  getSeriesDetails,
  searchMovies,
  searchSeries,
  searchCatalog
} from './yts';

const mockMovie = {
  id: 1,
  title: 'Test Movie',
  year: 2024,
  rating: 8.5,
  medium_cover_image: 'img.jpg',
  large_cover_image: 'img-large.jpg',
  summary: 'Summary',
  description_full: 'Full',
  torrents: []
};

describe('yts api', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  it('fetches popular movies successfully from cinemeta', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        metas: [
          {
            imdb_id: 'tt123',
            name: 'Test Movie',
            year: '2024',
            imdbRating: '8.5',
            poster: 'img.jpg'
          }
        ]
      })
    });

    const movies = await getPopularMovies();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('top.json'),
      expect.objectContaining({ signal: expect.anything() })
    );
    expect(movies.length).toBe(1);
    expect(movies[0].title).toBe('Test Movie');
    expect(movies[0].id).toBe('tt123');
  });

  it('fetches movie details successfully with movie_id', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'ok',
        data: { movie: mockMovie }
      })
    });

    const movie = await getMovieDetails(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('movie_details.json?movie_id=1'),
      expect.objectContaining({ signal: expect.anything() })
    );
    expect(movie.title).toBe('Test Movie');
  });

  it('fetches movie details successfully with imdb_id', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'ok',
        data: { movie: mockMovie }
      })
    });

    const movie = await getMovieDetails('tt12345');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('movie_details.json?imdb_id=tt12345'),
      expect.objectContaining({ signal: expect.anything() })
    );
    expect(movie.title).toBe('Test Movie');
  });

  it('normalizes movie.id to movie.imdb_code when available', async () => {
    const movieWithImdbCode = { ...mockMovie, imdb_code: 'tt9999999' };
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'ok',
        data: { movie: movieWithImdbCode }
      })
    });

    const movie = await getMovieDetails('tt9999999');
    expect(movie.id).toBe('tt9999999');
  });

  it('throws when cinemeta api fails to fetch popular movies', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      statusText: 'Not Found'
    });

    // Console error will be printed, we can mock it or just let it print
    const originalConsoleError = console.error;
    console.error = vi.fn();

    await expect(getPopularMovies()).rejects.toThrow(
      'Failed to fetch popular movies from cinemeta: Not Found'
    );

    console.error = originalConsoleError;
  });

  it('throws an error when status is not ok in movie details', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'error'
      })
    });
    await expect(getMovieDetails(1)).rejects.toThrow('API returned an error');
  });

  it('throws an error when fetch fails in movie details', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      statusText: 'Internal Server Error'
    });
    await expect(getMovieDetails(1)).rejects.toThrow(
      'Failed to fetch movie details: Internal Server Error'
    );
  });

  it('fetches popular series successfully from cinemeta', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        metas: [
          {
            imdb_id: 'tt987',
            name: 'Test Series',
            year: '2024',
            imdbRating: '9.0',
            poster: 'img_series.jpg'
          }
        ]
      })
    });

    const series = await getPopularSeries();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('series/top.json'),
      expect.objectContaining({ signal: expect.anything() })
    );
    expect(series.length).toBe(1);
    expect(series[0].title).toBe('Test Series');
    expect(series[0].id).toBe('tt987');
  });

  it('fetches series details successfully', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        meta: {
          id: 'tt987',
          name: 'Test Series Detail',
          year: '2024',
          imdbRating: '9.0',
          poster: 'img_series.jpg'
        }
      })
    });

    const details = await getSeriesDetails('tt987');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('meta/series/tt987.json'),
      expect.objectContaining({ signal: expect.anything() })
    );
    expect(details.title).toBe('Test Series Detail');
    expect(details.id).toBe('tt987');
  });

  it('throws an error when fetch fails in series details', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      statusText: 'Not Found'
    });
    await expect(getSeriesDetails('tt987')).rejects.toThrow(
      'Failed to fetch series details: Not Found'
    );
  });

  it('searches movies via cinemeta using the search endpoint', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        metas: [
          {
            id: 'tt1375666',
            imdb_id: 'tt1375666',
            name: 'Inception',
            releaseInfo: '2010',
            poster: 'inception.jpg'
          }
        ]
      })
    });

    const results = await searchMovies('inception');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('catalog/movie/top/search=inception.json'),
      expect.objectContaining({ signal: expect.anything() })
    );
    expect(results.length).toBe(1);
    expect(results[0].title).toBe('Inception');
    expect(results[0].year).toBe(2010);
  });

  it('encodes the search query in the url', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ metas: [] })
    });

    await searchMovies('piratas do caribe');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent('piratas do caribe')),
      expect.objectContaining({ signal: expect.anything() })
    );
  });

  it('searches series via cinemeta using the search endpoint', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        metas: [
          {
            id: 'tt0903747',
            imdb_id: 'tt0903747',
            name: 'Breaking Bad',
            releaseInfo: '2008-2013',
            poster: 'breaking.jpg'
          }
        ]
      })
    });

    const results = await searchSeries('breaking');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('catalog/series/top/search=breaking.json'),
      expect.objectContaining({ signal: expect.anything() })
    );
    expect(results.length).toBe(1);
    expect(results[0].title).toBe('Breaking Bad');
    expect(results[0].year).toBe(2008);
  });

  it('returns an empty array when the search request fails', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      statusText: 'Not Found'
    });

    const originalConsoleError = console.error;
    console.error = vi.fn();

    const results = await searchMovies('shrek');
    expect(results).toEqual([]);

    console.error = originalConsoleError;
  });

  it('searchCatalog queries movies and series in parallel', async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ metas: [{ id: 'tt1', name: 'Movie Result', poster: 'a.jpg' }] })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ metas: [{ id: 'tt2', name: 'Series Result', poster: 'b.jpg' }] })
      });

    const { movies, series } = await searchCatalog('result');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(movies.length).toBe(1);
    expect(movies[0].title).toBe('Movie Result');
    expect(series.length).toBe(1);
    expect(series[0].title).toBe('Series Result');
  });
});

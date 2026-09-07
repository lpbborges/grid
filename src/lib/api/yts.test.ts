import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPopularMovies, getMovieDetails, getPopularSeries, getSeriesDetails } from './yts';

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
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('top.json'));
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
      expect.stringContaining('movie_details.json?movie_id=1')
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
      expect.stringContaining('movie_details.json?imdb_id=tt12345')
    );
    expect(movie.title).toBe('Test Movie');
  });

  it('returns empty array when cinemeta api fails', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      statusText: 'Not Found'
    });

    // Console error will be printed, we can mock it or just let it print
    const originalConsoleError = console.error;
    console.error = vi.fn();

    const movies = await getPopularMovies();
    expect(movies).toEqual([]);

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
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('series/top.json'));
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
      expect.stringContaining('meta/series/tt987.json')
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
});

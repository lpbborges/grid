import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPopularMovies, getMovieDetails } from './yts';

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
});

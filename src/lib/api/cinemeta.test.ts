import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getPopularMovies,
  getMovieDetails,
  getPopularSeries,
  getSeriesDetails,
  searchMovies,
  searchSeries,
  searchCatalog,
  searchLocalizedCatalog
} from './cinemeta';

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

function routeFetch(routes: Record<string, unknown>) {
  (globalThis.fetch as any).mockImplementation(async (url: string) => {
    const match = Object.keys(routes).find((fragment) => url.includes(fragment));
    if (match === undefined) return { ok: false, statusText: 'Not Found' };
    return { ok: true, json: async () => routes[match] };
  });
}

function claims(values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values).map(([property, value]) => [
      property,
      [{ mainsnak: { datavalue: { value } } }]
    ])
  );
}

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

  it('searchCatalog lists movies and series together, alternating, with their type', async () => {
    routeFetch({
      'catalog/movie/top/search=result.json': {
        metas: [
          { id: 'tt1', name: 'Movie One' },
          { id: 'tt2', name: 'Movie Two' },
          { id: 'tt3', name: 'Movie Three' }
        ]
      },
      'catalog/series/top/search=result.json': { metas: [{ id: 'tt4', name: 'Series One' }] },
      wbsearchentities: { search: [] }
    });

    const results = await searchCatalog('result', () => {});
    expect(results.map((r) => [r.title, r.type])).toEqual([
      ['Movie One', 'movie'],
      ['Series One', 'series'],
      ['Movie Two', 'movie'],
      ['Movie Three', 'movie']
    ]);
  });

  it('searchCatalog reports what it found so far without waiting for a slow source', async () => {
    let answerMovies!: () => void;
    const moviesAnswered = new Promise<void>((resolve) => (answerMovies = resolve));
    (globalThis.fetch as any).mockImplementation(async (url: string) => {
      const json = (body: unknown) => ({ ok: true, json: async () => body });
      if (url.includes('catalog/movie/top/search=')) {
        await moviesAnswered;
        return json({ metas: [{ id: 'tt1', name: 'Slow Movie' }] });
      }
      if (url.includes('catalog/series/top/search=')) {
        return json({ metas: [{ id: 'tt2', name: 'Series' }] });
      }
      if (url.includes('wbsearchentities')) return json({ search: [{ id: 'Q1' }] });
      if (url.includes('wbgetentities')) {
        return json({ entities: { Q1: { claims: claims({ P345: 'tt3' }) } } });
      }
      if (url.includes('meta/movie/tt3.json')) return json({ meta: { id: 'tt3', name: 'Local' } });
      return json({});
    });

    const reports: [string[], boolean][] = [];
    const search = searchCatalog('x', (results, done) =>
      reports.push([results.map((r) => r.title), done])
    );
    await vi.waitFor(() => expect(reports).toHaveLength(2));

    expect(reports[reports.length - 1]).toEqual([['Local', 'Series'], false]);

    answerMovies();
    await search;

    expect(reports[reports.length - 1]).toEqual([['Local', 'Slow Movie', 'Series'], true]);
    expect(reports.filter(([, done]) => done)).toHaveLength(1);
  });

  it('searchLocalizedCatalog finds titles by their Brazilian or original name through Wikidata', async () => {
    routeFetch({
      wbsearchentities: { search: [{ id: 'Q25188' }, { id: 'Q886' }] },
      wbgetentities: {
        entities: {
          Q25188: { claims: claims({ P345: 'tt1375666' }) },
          Q886: { claims: claims({ P345: 'tt0096697' }) }
        }
      },
      'meta/series/tt1375666.json': {},
      'meta/movie/tt1375666.json': { meta: { id: 'tt1375666', name: 'Inception' } },
      'meta/series/tt0096697.json': { meta: { id: 'tt0096697', name: 'The Simpsons' } },
      'meta/movie/tt0096697.json': { meta: { id: 'tt0096697', name: 'The Simpsons' } }
    });

    const results = await searchLocalizedCatalog('A Origem');
    expect(results.map((r) => [r.title, r.type])).toEqual([
      ['Inception', 'movie'],
      ['The Simpsons', 'series']
    ]);
  });

  it('searchLocalizedCatalog skips Wikidata matches that Cinemeta does not know', async () => {
    routeFetch({
      wbsearchentities: { search: [{ id: 'Q1' }] },
      wbgetentities: { entities: { Q1: { claims: claims({ P345: 'tt0000001' }) } } },
      'meta/series/tt0000001.json': {},
      'meta/movie/tt0000001.json': {}
    });

    expect(await searchLocalizedCatalog('desconhecido')).toEqual([]);
  });

  it('searchLocalizedCatalog finds nothing when Wikidata is unavailable', async () => {
    routeFetch({});

    expect(await searchLocalizedCatalog('A Origem')).toEqual([]);
  });

  it('searchCatalog lists a title found by both searches once, where Wikidata ranked it', async () => {
    routeFetch({
      'catalog/movie/top/search=': {
        metas: [
          { id: 'tt1', name: 'Catalog Movie' },
          { id: 'tt1375666', name: 'Inception' }
        ]
      },
      'catalog/series/top/search=': { metas: [] },
      wbsearchentities: { search: [{ id: 'Q25188' }] },
      wbgetentities: { entities: { Q25188: { claims: claims({ P345: 'tt1375666' }) } } },
      'meta/series/tt1375666.json': {},
      'meta/movie/tt1375666.json': { meta: { id: 'tt1375666', name: 'Inception' } }
    });

    const results = await searchCatalog('A Origem', () => {});
    expect(results.map((r) => r.id)).toEqual(['tt1375666', 'tt1']);
  });

  it('loads details from Cinemeta alone, even with a TMDB key configured', async () => {
    vi.stubEnv('VITE_TMDB_API_KEY', 'test-key');
    vi.resetModules();
    const cinemeta = await import('./cinemeta');
    (globalThis.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok', data: { movie: mockMovie } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ meta: { id: 'tt987', name: 'Series', year: '2024' } })
      });

    await cinemeta.getMovieDetails(1);
    await cinemeta.getSeriesDetails('tt987');

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    vi.unstubAllEnvs();
  });
});

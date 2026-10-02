import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/svelte';
import HomePage from './+page.svelte';
import type { MediaType, Movie, SearchResult } from '$lib/types';
import { appReady, searchQuery } from '$lib/stores.svelte';
import { progressStore } from '$lib/stores/progress.svelte';
import { listsStore } from '$lib/stores/lists.svelte';
import { tick } from 'svelte';

const { searchCatalogMock, getCatalogMock } = vi.hoisted(() => ({
  searchCatalogMock: vi.fn(),
  getCatalogMock: vi.fn()
}));

vi.mock('$lib/api/cinemeta', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/api/cinemeta')>()),
  searchCatalog: searchCatalogMock,
  getCatalog: getCatalogMock
}));

type SearchReport = (results: SearchResult[], done: boolean) => void;
let searchReports: SearchReport[] = [];

async function report(results: SearchResult[], done = true, search = searchReports.length - 1) {
  await act(() => searchReports[search](results, done));
}

async function typeQuery(query: string) {
  await act(() => {
    searchQuery.value = query;
  });
  await act(async () => {
    vi.advanceTimersByTime(300);
  });
}

function makeMovie(id: string, title: string): Movie {
  return {
    id,
    title,
    year: 2024,
    rating: 8,
    medium_cover_image: 'img.jpg',
    large_cover_image: 'img-large.jpg',
    summary: 'Summary',
    description_full: 'Full description',
    torrents: []
  };
}

function makeResult(id: string, title: string, type: MediaType = 'movie') {
  return { ...makeMovie(id, title), type };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function popularDataWith(movies: Movie[], series: Movie[]) {
  return {
    popularMovies: Promise.resolve(movies),
    popularSeries: Promise.resolve(series)
  };
}

describe('Home page search', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getCatalogMock.mockResolvedValue([]);
    vi.useFakeTimers();
    searchQuery.value = '';
    appReady.value = false;
    progressStore.progress = {};
    searchReports = [];
    searchCatalogMock.mockImplementation((_query: string, onUpdate: SearchReport) => {
      searchReports.push(onUpdate);
      return new Promise(() => {});
    });
  });

  afterEach(() => {
    searchQuery.value = '';
    vi.useRealTimers();
  });

  it('renders popular movies and series when not searching', async () => {
    render(HomePage, {
      data: popularDataWith(
        [makeMovie('tt1', 'Popular Movie')],
        [makeMovie('tt2', 'Popular Series')]
      )
    });

    await act(async () => {});

    expect(screen.getAllByText('Popular Movie')[0]).toBeTruthy();
    expect(screen.getAllByText('Popular Series')[0]).toBeTruthy();
  });

  it('does not call the api immediately and only searches after the debounce', async () => {
    render(HomePage, { data: popularDataWith([], []) });
    await act(async () => {});

    await act(() => {
      searchQuery.value = 'inception';
    });

    expect(screen.getByText('Pesquisando...')).toBeTruthy();
    expect(searchCatalogMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(299);
    });

    expect(searchCatalogMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(searchCatalogMock).toHaveBeenCalledWith('inception', expect.any(Function));
    await report([makeResult('tt3', 'Searched Movie')]);
    expect(screen.getAllByText('Searched Movie')[0]).toBeTruthy();
  });

  it('shows movies and series together, each linking to its own page', async () => {
    render(HomePage, { data: popularDataWith([], []) });
    await act(async () => {});

    await typeQuery('searched');
    await report([
      makeResult('tt3', 'Searched Movie'),
      makeResult('tt4', 'Searched Series', 'series')
    ]);

    expect(screen.getByText('Resultados')).toBeTruthy();
    expect(screen.queryByText('Filmes')).toBeNull();
    expect(screen.queryByText('Séries')).toBeNull();
    expect(screen.getAllByTestId('media-card').map((card) => card.getAttribute('href'))).toEqual([
      '/movie/tt3',
      '/series/tt4'
    ]);
  });

  it('shows the first results while the rest of the search is still running', async () => {
    render(HomePage, { data: popularDataWith([], []) });
    await act(async () => {});

    await typeQuery('insacia');
    await report([makeResult('tt1', 'First Found')], false);

    expect(screen.queryByText('Pesquisando...')).toBeNull();
    expect(screen.getAllByText('First Found')[0]).toBeTruthy();

    await report([makeResult('tt2', 'Found Later'), makeResult('tt1', 'First Found')]);

    expect(screen.getAllByRole('img').map((img) => img.getAttribute('alt'))).toEqual([
      'Found Later',
      'First Found'
    ]);
  });

  it('keeps searching while nothing is found yet but the search is still running', async () => {
    render(HomePage, { data: popularDataWith([], []) });
    await act(async () => {});

    await typeQuery('O Poderoso Chefão');
    await report([], false);

    expect(screen.getByText('Pesquisando...')).toBeTruthy();
    expect(screen.queryByText(/Nenhum resultado/)).toBeNull();

    await report([makeResult('tt0068646', 'The Godfather')]);

    expect(screen.queryByText('Pesquisando...')).toBeNull();
    expect(screen.getAllByText('The Godfather')[0]).toBeTruthy();
  });

  it('shows a no-results message when the finished search found nothing', async () => {
    render(HomePage, { data: popularDataWith([], []) });
    await act(async () => {});

    await typeQuery('zzzz');
    await report([], false);
    await report([]);

    expect(screen.getByText(/Nenhum resultado para "zzzz"/)).toBeTruthy();
  });

  it('ignores results from an outdated query', async () => {
    render(HomePage, { data: popularDataWith([], []) });
    await act(async () => {});

    await typeQuery('old');
    await typeQuery('new');
    await report([makeResult('tt5', 'Newer Result')]);
    await report([makeResult('tt6', 'Stale Result')], true, 0);

    expect(screen.queryByText('Stale Result')).toBeNull();
    expect(screen.getAllByText('Newer Result')[0]).toBeTruthy();
  });

  it('returns to popular lists when the query is cleared', async () => {
    render(HomePage, {
      data: popularDataWith(
        [makeMovie('tt1', 'Popular Movie')],
        [makeMovie('tt2', 'Popular Series')]
      )
    });
    await act(async () => {});

    await typeQuery('inception');
    await report([makeResult('tt3', 'Searched Movie')]);
    expect(screen.getAllByText('Searched Movie')[0]).toBeTruthy();

    await act(() => {
      searchQuery.value = '';
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.queryByText('Searched Movie')).toBeNull();
    expect(screen.getAllByText('Popular Movie')[0]).toBeTruthy();
    expect(screen.getAllByText('Popular Series')[0]).toBeTruthy();
  });

  it('shows a loading skeleton while the popular catalog is still resolving', async () => {
    const moviesDeferred = deferred<Movie[]>();
    const seriesDeferred = deferred<Movie[]>();

    render(HomePage, {
      data: {
        popularMovies: moviesDeferred.promise,
        popularSeries: seriesDeferred.promise
      }
    });

    expect(screen.getByText('Carregando...')).toBeTruthy();
    expect(screen.queryByText('Popular Movie')).toBeNull();

    await act(async () => {
      moviesDeferred.resolve([makeMovie('tt1', 'Popular Movie')]);
      seriesDeferred.resolve([]);
    });

    expect(screen.queryByText('Carregando...')).toBeNull();
    expect(screen.getAllByText('Popular Movie')[0]).toBeTruthy();
  });

  it('shows a neutral empty state when the catalog resolves with nothing', async () => {
    render(HomePage, { data: popularDataWith([], []) });
    await act(async () => {});

    expect(screen.getByText('Nenhum título disponível no momento')).toBeTruthy();
    expect(screen.queryByText('Erro ao carregar dados')).toBeNull();
  });

  it('shows an error message when both popular fetches fail', async () => {
    render(HomePage, {
      data: {
        popularMovies: Promise.reject(new Error('network down')),
        popularSeries: Promise.reject(new Error('network down'))
      }
    });
    await act(async () => {});

    expect(screen.getByText('Erro ao carregar dados')).toBeTruthy();
  });

  it('marks the app ready once the popular catalog arrives', async () => {
    const movies = deferred<Movie[]>();
    render(HomePage, {
      data: {
        popularMovies: movies.promise,
        popularSeries: Promise.resolve([])
      }
    });
    await act(async () => {});
    expect(appReady.value).toBe(false);

    await act(async () => movies.resolve([makeMovie('tt1', 'Popular Movie')]));

    expect(appReady.value).toBe(true);
  });

  it('marks the app ready when the popular catalog fails', async () => {
    render(HomePage, {
      data: {
        popularMovies: Promise.reject(new Error('network down')),
        popularSeries: Promise.reject(new Error('network down'))
      }
    });
    await act(async () => {});

    expect(appReady.value).toBe(true);
  });
});

describe('Home page continue watching', () => {
  const seriesMeta = { type: 'series' as const, title: 'Resumed Series', poster: 's.jpg' };
  const movieMeta = { type: 'movie' as const, title: 'Resumed Movie', poster: 'm.jpg' };

  beforeEach(() => {
    vi.resetAllMocks();
    getCatalogMock.mockResolvedValue([]);
    searchQuery.value = '';
    progressStore.progress = {};
  });

  it('hides the row when there is no progress', async () => {
    render(HomePage, { data: popularDataWith([makeMovie('tt1', 'Popular')], []) });
    await act(async () => {});

    expect(screen.queryByText('Continuar assistindo')).toBeNull();
  });

  it('lists titles newest first, linking series to the episode to resume', async () => {
    progressStore.progress = {
      tt1: { time: 10, duration: 100, updatedAt: 1, meta: movieMeta },
      'tt2-S2E5': { time: 10, duration: 100, updatedAt: 2, meta: seriesMeta }
    };
    render(HomePage, { data: popularDataWith([], []) });
    await act(async () => {});

    expect(screen.getByText('T2:E5')).toBeTruthy();
    expect(screen.getAllByTestId('media-card').map((c) => c.getAttribute('href'))).toEqual([
      '/series/tt2?s=2&e=5',
      '/movie/tt1'
    ]);
  });

  it('marks a title advanced to its next episode as up next', async () => {
    progressStore.progress = {
      'tt2-S3E1': { time: 0, duration: 100, updatedAt: 2, meta: seriesMeta, upNext: true }
    };
    render(HomePage, { data: popularDataWith([], []) });
    await act(async () => {});

    expect(screen.getByTestId('media-card-episode').textContent).toContain('Próximo');
  });

  it('does not mark an episode closed at the very start as up next', async () => {
    progressStore.progress = {
      'tt2-S3E1': { time: 0, duration: 100, updatedAt: 2, meta: seriesMeta }
    };
    render(HomePage, { data: popularDataWith([], []) });
    await act(async () => {});

    expect(screen.getByTestId('media-card-episode').textContent).not.toContain('Próximo');
  });

  it('skips only the title whose metadata failed and keeps the popular rows', async () => {
    progressStore.progress = {
      tt1: { time: 10, duration: 100, updatedAt: 2, meta: movieMeta },
      tt9: { time: 10, duration: 100, updatedAt: 1 }
    };
    render(HomePage, { data: popularDataWith([makeMovie('tt5', 'Popular Movie')], []) });
    await act(async () => {});

    expect(screen.getAllByTestId('media-card').map((c) => c.getAttribute('href'))).toEqual([
      '/movie/tt1',
      '/movie/tt5'
    ]);
  });

  it('adds a legacy title once its snapshot arrives', async () => {
    progressStore.progress = { tt1: { time: 10, duration: 100, updatedAt: 1 } };
    render(HomePage, { data: popularDataWith([], []) });
    await act(async () => {});
    expect(screen.queryByText('Continuar assistindo')).toBeNull();

    await act(() => progressStore.attachMeta({ tt1: movieMeta }));

    expect(screen.getAllByText('Resumed Movie')[0]).toBeTruthy();
  });

  it('shows the row while the popular titles are still loading', async () => {
    progressStore.progress = { tt1: { time: 10, duration: 100, updatedAt: 1, meta: movieMeta } };
    render(HomePage, {
      data: {
        popularMovies: new Promise<Movie[]>(() => {}),
        popularSeries: new Promise<Movie[]>(() => {})
      }
    });
    await act(async () => {});

    expect(screen.getByText('Continuar assistindo')).toBeTruthy();
    expect(screen.getByText('Carregando...')).toBeTruthy();
  });

  it('shows the row when the popular titles fail to load', async () => {
    progressStore.progress = { tt1: { time: 10, duration: 100, updatedAt: 1, meta: movieMeta } };
    render(HomePage, {
      data: {
        popularMovies: Promise.reject(new Error('down')),
        popularSeries: Promise.reject(new Error('down'))
      }
    });
    await act(async () => {});

    expect(screen.getByText('Continuar assistindo')).toBeTruthy();
    expect(screen.getByText('Erro ao carregar dados')).toBeTruthy();
  });

  it('hides the row while searching', async () => {
    progressStore.progress = { tt1: { time: 10, duration: 100, updatedAt: 1, meta: movieMeta } };
    render(HomePage, { data: popularDataWith([], []) });
    await act(async () => {});
    await act(() => {
      searchQuery.value = 'x';
    });

    expect(screen.queryByText('Continuar assistindo')).toBeNull();
  });

  it('restores a removed title when the user undoes', async () => {
    progressStore.progress = { tt1: { time: 10, duration: 100, updatedAt: 1, meta: movieMeta } };
    render(HomePage, { data: popularDataWith([], []) });
    await act(async () => {});

    await fireEvent.click(screen.getByRole('button', { name: 'Remover de Continuar assistindo' }));
    expect(screen.queryByText('Continuar assistindo')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));

    expect(screen.getByText('Continuar assistindo')).toBeTruthy();
  });

  it('focuses the first popular card once the emptied row’s toast closes', async () => {
    progressStore.progress = { tt1: { time: 10, duration: 100, updatedAt: 1, meta: movieMeta } };
    render(HomePage, { data: popularDataWith([makeMovie('tt5', 'Popular Movie')], []) });
    await act(async () => {});

    await fireEvent.click(screen.getByRole('button', { name: 'Remover de Continuar assistindo' }));
    await fireEvent.keyDown(screen.getByRole('button', { name: 'Desfazer' }), { key: 'Escape' });
    await tick();

    expect(document.activeElement?.getAttribute('href')).toBe('/movie/tt5');
  });
});

describe('Home page popular row', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getCatalogMock.mockResolvedValue([]);
    searchQuery.value = '';
    progressStore.progress = {};
  });

  const rated = (id: string, rating: number, type = 'movie') => ({
    ...makeMovie(id, `${type} ${id}`),
    rating
  });

  it('mixes movies and series by rating in one row, each opening its own page', async () => {
    render(HomePage, {
      data: popularDataWith(
        [rated('tt1', 9), rated('tt2', 7), rated('tt3', 6)],
        [rated('tt4', 8), rated('tt5', 6.5)].map((s) => ({ ...s, title: `series ${s.id}` }))
      )
    });
    await act(async () => {});

    const cards = screen.getAllByTestId('media-card');
    expect(cards.map((card) => card.getAttribute('href'))).toEqual([
      '/movie/tt1',
      '/series/tt4',
      '/movie/tt2',
      '/series/tt5',
      '/movie/tt3'
    ]);
    expect(screen.queryByText('Filmes Populares')).toBeNull();
    expect(screen.queryByText('Séries Populares')).toBeNull();
    expect(screen.getAllByTestId('media-card-type')).toHaveLength(5);
  });

  it('shows the series when the movie catalog fails to load', async () => {
    render(HomePage, {
      data: {
        popularMovies: Promise.reject(new Error('offline')),
        popularSeries: Promise.resolve([rated('tt4', 8)])
      }
    });
    await act(async () => {});

    expect(screen.getByText('Populares')).toBeTruthy();
    expect(screen.getAllByTestId('media-card').map((c) => c.getAttribute('href'))).toEqual([
      '/series/tt4'
    ]);
  });

  it('reports an error only when neither catalog loaded', async () => {
    render(HomePage, {
      data: {
        popularMovies: Promise.reject(new Error('offline')),
        popularSeries: Promise.reject(new Error('offline'))
      }
    });
    await act(async () => {});

    expect(screen.getByText('Erro ao carregar dados')).toBeTruthy();
  });
});

describe('Home page lists', () => {
  const movieMeta = { type: 'movie' as const, title: 'Listed Movie', poster: 'm.jpg' };
  const seriesMeta = { type: 'series' as const, title: 'Listed Series', poster: 's.jpg' };

  beforeEach(() => {
    vi.resetAllMocks();
    getCatalogMock.mockResolvedValue([]);
    searchQuery.value = '';
    progressStore.progress = {};
    listsStore.lists = [
      { id: 'favorites', name: 'Favoritos', system: 'favorites', items: [] },
      { id: 'watch-later', name: 'Assistir depois', system: 'watch-later', items: [] }
    ];
  });

  function headings() {
    return screen.getAllByRole('heading').map((h) => h.textContent?.trim());
  }

  it('hides the rows of empty lists', async () => {
    render(HomePage, { data: popularDataWith([makeMovie('tt1', 'Popular')], []) });
    await act(async () => {});

    expect(screen.queryByText('Favoritos')).toBeNull();
    expect(screen.queryByText('Assistir depois')).toBeNull();
    expect(screen.queryByText('Meus favoritos')).toBeNull();
  });

  it('shows one row per non-empty list, newest title first, after every other row', async () => {
    progressStore.progress = {
      tt9: { time: 10, duration: 100, updatedAt: 1, meta: { ...movieMeta, title: 'Resumed' } }
    };
    listsStore.add('favorites', 'tt1', movieMeta);
    listsStore.add('favorites', 'tt2', seriesMeta);
    listsStore.add('watch-later', 'tt3', movieMeta);
    render(HomePage, {
      data: popularDataWith(
        [makeMovie('tt5', 'Popular Movie')],
        [makeMovie('tt6', 'Popular Series')]
      )
    });
    await act(async () => {});

    expect(headings()).toEqual([
      'Continuar assistindo',
      'Populares',
      'Favoritos',
      'Assistir depois'
    ]);
    const hrefs = screen.getAllByTestId('media-card').map((c) => c.getAttribute('href'));
    expect(hrefs.slice(-3)).toEqual(['/series/tt2', '/movie/tt1', '/movie/tt3']);
  });

  it('shows the rows of the lists the user created', async () => {
    const created = listsStore.create('Cinema');
    if (!created.ok) throw new Error('create failed');
    listsStore.add(created.list.id, 'tt1', movieMeta);
    render(HomePage, { data: popularDataWith([], []) });
    await act(async () => {});

    expect(headings()).toEqual(['Cinema']);
  });

  it('browses catalog rows between the popular rows and the lists', async () => {
    getCatalogMock.mockImplementation(async (query: { type: string; genre?: string }) =>
      query.type === 'movie' && query.genre === 'Horror' ? [makeMovie('tt7', 'Scary Movie')] : []
    );
    listsStore.add('favorites', 'tt1', movieMeta);
    render(HomePage, { data: popularDataWith([makeMovie('tt5', 'Popular Movie')], []) });
    await screen.findByText('Terror');

    expect(headings()).toEqual(['Populares', 'Terror', 'Favoritos']);
  });

  it('shows the rows while the popular titles are still loading', async () => {
    listsStore.add('favorites', 'tt1', movieMeta);
    render(HomePage, {
      data: {
        popularMovies: new Promise<Movie[]>(() => {}),
        popularSeries: new Promise<Movie[]>(() => {})
      }
    });
    await act(async () => {});

    expect(screen.getByText('Favoritos')).toBeTruthy();
  });

  it('drops a row once its last title leaves the list', async () => {
    listsStore.add('favorites', 'tt1', movieMeta);
    render(HomePage, { data: popularDataWith([], []) });
    await act(async () => {});
    expect(screen.getByText('Favoritos')).toBeTruthy();

    await act(() => listsStore.removeItem('favorites', 'tt1'));

    expect(screen.queryByText('Favoritos')).toBeNull();
  });

  it('adds a legacy title once its snapshot arrives', async () => {
    listsStore.add('favorites', 'tt1');
    render(HomePage, { data: popularDataWith([], []) });
    await act(async () => {});
    expect(screen.queryByText('Favoritos')).toBeNull();

    await act(() => listsStore.attachMeta({ tt1: movieMeta }));

    expect(screen.getAllByText('Listed Movie')[0]).toBeTruthy();
  });
});

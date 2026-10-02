import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/svelte';
import CatalogSearchHarness from './__fixtures__/CatalogSearchHarness.svelte';
import { searchQuery } from '$lib/stores.svelte';
import type { SearchResult } from '$lib/types';

const { searchCatalogMock, warnMock } = vi.hoisted(() => ({
  searchCatalogMock: vi.fn(),
  warnMock: vi.fn()
}));

vi.mock('$lib/logger', () => ({ logger: { warn: warnMock } }));

vi.mock('$lib/api/cinemeta', () => ({ searchCatalog: searchCatalogMock }));

type Report = (results: SearchResult[], done: boolean) => void;
let reports: Report[] = [];

const result = (id: string, title: string): SearchResult => ({
  id,
  title,
  type: 'movie',
  year: 2020,
  rating: 7,
  medium_cover_image: 'p.jpg',
  large_cover_image: 'p.jpg',
  summary: '',
  description_full: '',
  torrents: []
});

async function type(query: string) {
  await act(() => {
    searchQuery.value = query;
  });
}

const wait = (ms: number) =>
  act(async () => {
    vi.advanceTimersByTime(ms);
  });

describe('useCatalogSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    searchQuery.value = '';
    reports = [];
    searchCatalogMock.mockReset();
    searchCatalogMock.mockImplementation((_q: string, onUpdate: Report) => {
      reports.push(onUpdate);
      return new Promise(() => {});
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for the typing to pause before searching', async () => {
    render(CatalogSearchHarness);

    await type('mat');
    await wait(299);
    expect(searchCatalogMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('loading')).toHaveTextContent('true');

    await type('matrix');
    await wait(300);

    expect(searchCatalogMock).toHaveBeenCalledTimes(1);
    expect(searchCatalogMock).toHaveBeenCalledWith('matrix', expect.any(Function));
  });

  it('lists what it finds and stops loading once something arrives', async () => {
    render(CatalogSearchHarness);
    await type('matrix');
    await wait(300);

    await act(() => reports[0]([result('tt1', 'Matrix')], false));

    expect(screen.getByText('Matrix')).toBeInTheDocument();
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
  });

  it('keeps loading while nothing has been found and a source is still pending', async () => {
    render(CatalogSearchHarness);
    await type('matrix');
    await wait(300);

    await act(() => reports[0]([], false));
    expect(screen.getByTestId('loading')).toHaveTextContent('true');

    await act(() => reports[0]([], true));
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
  });

  it('limits the search to the scope', async () => {
    render(CatalogSearchHarness, { scope: 'series' });
    await type('matrix');
    await wait(300);

    expect(searchCatalogMock).toHaveBeenCalledWith(
      'matrix',
      expect.any(Function),
      undefined,
      undefined,
      { type: 'series' }
    );
  });

  it('ignores the late answer of an older query', async () => {
    render(CatalogSearchHarness);
    await type('matrix');
    await wait(300);
    await type('inception');
    await wait(300);

    await act(() => reports[0]([result('tt1', 'Old')], true));
    expect(screen.queryByText('Old')).toBeNull();

    await act(() => reports[1]([result('tt2', 'Inception')], true));
    expect(screen.getByText('Inception')).toBeInTheDocument();
  });

  it('clears results and never searches an empty query', async () => {
    render(CatalogSearchHarness);
    await type('matrix');
    await wait(300);
    await act(() => reports[0]([result('tt1', 'Matrix')], true));

    await type('  ');
    await wait(300);

    expect(screen.queryByText('Matrix')).toBeNull();
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
    expect(searchCatalogMock).toHaveBeenCalledTimes(1);
  });

  it('stops loading and logs when the search fails', async () => {
    searchCatalogMock.mockRejectedValueOnce(new Error('offline'));
    render(CatalogSearchHarness);
    await type('matrix');

    await wait(300);

    expect(screen.getByTestId('loading')).toHaveTextContent('false');
    expect(warnMock).toHaveBeenCalledWith('Catalog search failed', expect.any(Error));
  });

  it('does not touch the state of a newer query when an older search fails late', async () => {
    let fail!: (error: Error) => void;
    searchCatalogMock.mockReturnValueOnce(new Promise((_, reject) => (fail = reject)));
    render(CatalogSearchHarness);
    await type('matrix');
    await wait(300);
    await type('inception');

    await act(async () => fail(new Error('late')));

    expect(screen.getByTestId('loading')).toHaveTextContent('true');
  });
});

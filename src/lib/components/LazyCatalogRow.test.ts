import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/svelte';
import LazyCatalogRow from './LazyCatalogRow.svelte';
import type { Movie } from '$lib/types';

const { getCatalogMock } = vi.hoisted(() => ({ getCatalogMock: vi.fn() }));

vi.mock('$lib/api/cinemeta', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/api/cinemeta')>()),
  getCatalog: getCatalogMock
}));

let reportVisible: (visible: boolean) => void;
const disconnect = vi.fn();

class FakeIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    reportVisible = (visible) =>
      callback(
        [{ isIntersecting: visible } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver
      );
  }
  observe() {}
  disconnect = disconnect;
}

function title(id: string, name: string): Movie {
  return {
    id,
    title: name,
    year: 2026,
    rating: 7,
    medium_cover_image: 'p.jpg',
    large_cover_image: 'p.jpg',
    summary: '',
    description_full: '',
    torrents: []
  };
}

const row = {
  heading: 'Séries em destaque',
  query: { type: 'series' as const, catalog: 'imdbRating' as const }
};

describe('LazyCatalogRow', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    getCatalogMock.mockReset();
    disconnect.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('waits until the row comes near the screen before asking for it', async () => {
    getCatalogMock.mockResolvedValue([title('tt1', 'Série')]);
    render(LazyCatalogRow, { row });

    expect(getCatalogMock).not.toHaveBeenCalled();
    await act(() => reportVisible(false));
    expect(getCatalogMock).not.toHaveBeenCalled();

    await act(() => reportVisible(true));

    expect(getCatalogMock).toHaveBeenCalledWith(row.query);
    expect(disconnect).toHaveBeenCalled();
    expect(await screen.findByText('Séries em destaque')).toBeTruthy();
    expect(screen.getByTestId('media-card').getAttribute('href')).toBe('/series/tt1');
  });

  it('disappears when its catalog fails, leaving the rest of the page alone', async () => {
    getCatalogMock.mockRejectedValue(new Error('offline'));
    const { container } = render(LazyCatalogRow, { row });

    await act(() => reportVisible(true));

    expect(screen.queryByText('Séries em destaque')).toBeNull();
    expect(container.querySelector('[data-testid="catalog-row-placeholder"]')).toBeNull();
  });

  it('disappears when its catalog is empty', async () => {
    getCatalogMock.mockResolvedValue([]);
    render(LazyCatalogRow, { row });

    await act(() => reportVisible(true));

    expect(screen.queryByText('Séries em destaque')).toBeNull();
  });

  it('leaves out the title being viewed', async () => {
    getCatalogMock.mockResolvedValue([title('tt1', 'Esta'), title('tt2', 'Outra')]);
    render(LazyCatalogRow, { row, excludeId: 'tt1' });

    await act(() => reportVisible(true));

    expect(screen.getAllByTestId('media-card').map((c) => c.getAttribute('href'))).toEqual([
      '/series/tt2'
    ]);
  });
});

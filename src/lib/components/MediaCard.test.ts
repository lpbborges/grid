import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import MediaCard from './MediaCard.svelte';
import type { Movie } from '../types';
import { progressStore } from '$lib/stores/progress.svelte';

const mockMovie: Movie = {
  id: 123,
  title: 'Test Movie',
  year: 2024,
  rating: 9.9,
  medium_cover_image: 'test.jpg',
  large_cover_image: 'test-large.jpg',
  summary: 'A test summary',
  description_full: 'A full test description',
  torrents: []
};

describe('MediaCard component', () => {
  beforeEach(() => {
    progressStore.progress = {};
  });

  it('shows the progress bar for a partially watched movie', () => {
    progressStore.update(123, undefined, undefined, 25, 100);
    const { getByTestId } = render(MediaCard, { media: mockMovie, type: 'movie' });

    expect(getByTestId('media-card-progress').getAttribute('style')).toContain('width: 25%');
  });

  it('shows the progress bar for a title marked watched and played again', async () => {
    const { watchedStore } = await import('$lib/stores/watched.svelte');
    watchedStore.add(123);
    progressStore.update(123, undefined, undefined, 30, 100);
    const { getByTestId } = render(MediaCard, { media: mockMovie, type: 'movie' });

    expect(getByTestId('media-card-progress').getAttribute('style')).toContain('width: 30%');
    watchedStore.remove(123);
  });

  it('shows the progress bar for the most recently watched episode of a series', () => {
    progressStore.progress = {
      '123-S1E1': { time: 10, duration: 100, updatedAt: 1 },
      '123-S1E2': { time: 40, duration: 100, updatedAt: 2 },
      '1234-S1E1': { time: 90, duration: 100, updatedAt: 3 }
    };
    const { getByTestId } = render(MediaCard, { media: mockMovie, type: 'series' });

    expect(getByTestId('media-card-progress').getAttribute('style')).toContain('width: 40%');
  });

  it('hides the progress bar when there is no progress', () => {
    const { queryByTestId } = render(MediaCard, { media: mockMovie, type: 'series' });

    expect(queryByTestId('media-card-progress')).toBeNull();
  });

  it('renders media title and details for movie', () => {
    const { getAllByText, getByAltText } = render(MediaCard, { media: mockMovie, type: 'movie' });

    expect(getAllByText('Test Movie')[0]).toBeDefined();
    expect(getByAltText('Test Movie')).toBeDefined();

    const link = getAllByText('Test Movie')[0].closest('a');
    expect(link?.getAttribute('href')).toBe('/movie/123');
  });

  it('renders media title and details for series', () => {
    const { getAllByText, getByAltText } = render(MediaCard, { media: mockMovie, type: 'series' });

    expect(getAllByText('Test Movie')[0]).toBeDefined();
    expect(getByAltText('Test Movie')).toBeDefined();

    const link = getAllByText('Test Movie')[0].closest('a');
    expect(link?.getAttribute('href')).toBe('/series/123');
  });

  it('shows no mark for a title that is in a list', async () => {
    const { listsStore } = await import('$lib/stores/lists.svelte');
    listsStore.add('favorites', 123, { type: 'movie', title: 'Test Movie', poster: 'p.jpg' });

    const { queryByTitle, getByTestId } = render(MediaCard, { media: mockMovie, type: 'movie' });

    expect(queryByTitle('Favorito')).not.toBeInTheDocument();
    expect(getByTestId('media-card').className).not.toContain('orange');
    expect(getByTestId('media-card').innerHTML).not.toContain('orange');
  });

  it('shows the Assistido mark on a watched title', async () => {
    const { watchedStore } = await import('$lib/stores/watched.svelte');
    watchedStore.add(123);

    const { getByTitle } = render(MediaCard, { media: mockMovie, type: 'movie' });

    expect(getByTitle('Assistido')).toBeInTheDocument();
  });

  it.each([
    ['movie', 'Filme'],
    ['series', 'Série']
  ] as const)('names a %s as %s when the row does not imply the type', (type, label) => {
    const { getByTestId } = render(MediaCard, { media: mockMovie, type, showType: true });

    expect(getByTestId('media-card-type')).toHaveTextContent(label);
  });

  it('shows no type unless asked to', () => {
    const { queryByTestId } = render(MediaCard, { media: mockMovie, type: 'series' });

    expect(queryByTestId('media-card-type')).not.toBeInTheDocument();
  });

  it('links to the given href and shows the episode label', () => {
    const { getByTestId } = render(MediaCard, {
      media: mockMovie,
      type: 'series',
      href: '/series/123?s=2&e=5',
      episodeLabel: 'T2:E5'
    });

    expect(getByTestId('media-card').getAttribute('href')).toBe('/series/123?s=2&e=5');
    expect(getByTestId('media-card-episode').textContent).toContain('T2:E5');
    expect(getByTestId('media-card-episode').textContent).not.toContain('Próximo');
  });

  it('marks an up-next episode label', () => {
    const { getByTestId } = render(MediaCard, {
      media: mockMovie,
      type: 'series',
      episodeLabel: 'T3:E1',
      upNext: true,
      progress: { time: 0, duration: 100 }
    });

    const badge = getByTestId('media-card-episode');
    expect(badge.textContent).toContain('Próximo');
    expect(badge.textContent).toContain('T3:E1');
    expect(badge.className).toContain('bg-green');
    expect(getByTestId('media-card-progress').getAttribute('style')).toContain('width: 0%');
  });

  it('shows the given progress even for a title marked watched', async () => {
    const { watchedStore } = await import('$lib/stores/watched.svelte');
    watchedStore.watchedIds = ['123'];
    const { getByTestId } = render(MediaCard, {
      media: mockMovie,
      type: 'series',
      progress: { time: 30, duration: 100 }
    });

    expect(getByTestId('media-card-progress').getAttribute('style')).toContain('width: 30%');
    watchedStore.watchedIds = [];
  });

  it('adds a track and a spoken percentage when progress is given', () => {
    const { getByTestId } = render(MediaCard, {
      media: mockMovie,
      progress: { time: 42.4, duration: 100 }
    });

    expect(getByTestId('media-card-progress-track')).toBeTruthy();
    expect(getByTestId('media-card').textContent).toContain('42% assistido');
  });

  it('names the link by title first, then episode and progress', () => {
    render(MediaCard, {
      media: mockMovie,
      type: 'series',
      episodeLabel: 'T2:E5',
      progress: { time: 42.4, duration: 100 }
    });

    expect(screen.getByRole('link').getAttribute('aria-label')).toBeNull();
    expect(screen.getByRole('link', { name: /^Test Movie.* T2:E5 42% assistido$/ })).toBeTruthy();
  });

  it('names a movie link by title, then progress', () => {
    render(MediaCard, { media: mockMovie, progress: { time: 42.4, duration: 100 } });

    expect(screen.getByRole('link', { name: /^Test Movie.* 42% assistido$/ })).toBeTruthy();
  });

  it('keeps the popular cards without a track or spoken percentage', () => {
    progressStore.update(123, undefined, undefined, 25, 100);
    const { getByTestId, queryByTestId } = render(MediaCard, { media: mockMovie });

    expect(queryByTestId('media-card-progress-track')).toBeNull();
    expect(getByTestId('media-card').textContent).not.toContain('assistido');
  });
});

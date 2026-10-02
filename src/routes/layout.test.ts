import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRawSnippet } from 'svelte';
import { playerState, searchQuery } from '$lib/stores.svelte';

const { pageState, gotoMock, navigation } = vi.hoisted(() => ({
  pageState: { url: new URL('http://localhost/') },
  gotoMock: vi.fn(),
  navigation: { after: (() => {}) as (nav: unknown) => void }
}));

vi.mock('$app/state', () => ({ page: pageState }));
vi.mock('$app/navigation', () => ({
  goto: gotoMock,
  afterNavigate: (callback: (nav: unknown) => void) => {
    navigation.after = callback;
  }
}));

const navigate = (from: string, to: string) =>
  navigation.after({
    from: { url: new URL(`http://localhost${from}`) },
    to: { url: new URL(`http://localhost${to}`) }
  });
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    isMaximized: vi.fn().mockResolvedValue(false),
    onResized: vi.fn().mockResolvedValue(vi.fn())
  })
}));

import Layout from './+layout.svelte';

const children = createRawSnippet(() => ({ render: () => '<div></div>' }));

describe('Layout', () => {
  beforeEach(() => {
    searchQuery.value = '';
    playerState.isPlaying = false;
    pageState.url = new URL('http://localhost/');
    gotoMock.mockReset();
  });

  it('clears the search when the logo is clicked', async () => {
    searchQuery.value = 'matrix';
    render(Layout, { children });

    await fireEvent.click(screen.getByRole('link', { name: 'Início' }));

    expect(searchQuery.value).toBe('');
  });

  it('links to the settings from the header', () => {
    render(Layout, { children });

    expect(screen.getByRole('link', { name: 'Configurações' }).getAttribute('href')).toBe(
      '/settings'
    );
  });

  it('offers the search on a title page too', () => {
    pageState.url = new URL('http://localhost/movie/tt1');
    render(Layout, { children });

    expect(screen.getByRole('searchbox', { name: 'Pesquisar' })).toBeTruthy();
  });

  it('hides the header while something is playing', () => {
    playerState.isPlaying = true;
    render(Layout, { children });

    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('takes a search typed on a title page to the results on the home screen', async () => {
    pageState.url = new URL('http://localhost/series/tt2');
    render(Layout, { children });

    await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'matrix' } });

    expect(searchQuery.value).toBe('matrix');
    expect(gotoMock).toHaveBeenCalledWith('/');
  });

  it.each(['/movies', '/series'])('searches in place on %s', async (path) => {
    pageState.url = new URL(`http://localhost${path}`);
    render(Layout, { children });

    await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'matrix' } });

    expect(searchQuery.value).toBe('matrix');
    expect(gotoMock).not.toHaveBeenCalled();
  });

  it.each(['/movie/tt1', '/settings', '/new', '/my-grid'])(
    'still takes a search typed on %s to the home screen',
    async (path) => {
      pageState.url = new URL(`http://localhost${path}`);
      render(Layout, { children });

      await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'matrix' } });

      expect(gotoMock).toHaveBeenCalledWith('/');
    }
  );

  it('clears the search when the page changes', () => {
    searchQuery.value = 'matrix';
    render(Layout, { children });

    navigate('/movies', '/series');

    expect(searchQuery.value).toBe('');
  });

  it('keeps the search when only the genre changes', () => {
    searchQuery.value = 'matrix';
    render(Layout, { children });

    navigate('/movies', '/movies?genre=Action');

    expect(searchQuery.value).toBe('matrix');
  });

  it('keeps the search that sent the user to the results on the home screen', async () => {
    pageState.url = new URL('http://localhost/settings');
    render(Layout, { children });
    await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'matrix' } });

    navigate('/settings', '/');

    expect(searchQuery.value).toBe('matrix');
  });

  it('stays on the home screen while searching there', async () => {
    render(Layout, { children });

    await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'matrix' } });

    expect(gotoMock).not.toHaveBeenCalled();
  });

  it.each([
    ['Ctrl+K', { key: 'k', ctrlKey: true }],
    ['/', { key: '/' }]
  ])('focuses the search with %s', async (_name, init) => {
    render(Layout, { children });

    await fireEvent.keyDown(window, init);

    expect(document.activeElement).toBe(screen.getByRole('searchbox'));
  });

  it('leaves / alone while typing elsewhere', async () => {
    render(Layout, { children });
    const other = document.createElement('input');
    document.body.appendChild(other);
    other.focus();

    await fireEvent.keyDown(other, { key: '/' });

    expect(document.activeElement).toBe(other);
    other.remove();
  });

  it('keeps the header above the backdrop that title pages fix behind them', () => {
    pageState.url = new URL('http://localhost/movie/tt1');
    const { container } = render(Layout, { children });

    expect(container.querySelector('header')?.classList).toContain('z-20');
    expect(container.querySelector('header')?.classList).toContain('relative');
  });

  it('lets the title page backdrop show through the header instead of a dark band', () => {
    pageState.url = new URL('http://localhost/series/tt2');
    const { container } = render(Layout, { children });
    const classes = [...(container.querySelector('header')?.classList ?? [])];

    expect(classes.filter((c) => c.startsWith('bg-') || c.startsWith('backdrop-'))).toEqual([]);
  });
});

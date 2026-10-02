import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRawSnippet } from 'svelte';
import { playerState, searchQuery } from '$lib/stores.svelte';

const { pageState, gotoMock, navigation } = vi.hoisted(() => ({
  pageState: { url: new URL('http://localhost/') },
  gotoMock: vi.fn(),
  navigation: { callbacks: [] as ((nav: unknown) => void)[] }
}));

vi.mock('$app/state', () => ({ page: pageState }));
vi.mock('$app/navigation', () => ({
  goto: gotoMock,
  afterNavigate: (callback: (nav: unknown) => void) => {
    navigation.callbacks.push(callback);
  }
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    isMaximized: vi.fn().mockResolvedValue(false),
    onResized: vi.fn().mockResolvedValue(vi.fn())
  })
}));

import Layout from './+layout.svelte';

const children = createRawSnippet(() => ({ render: () => '<div></div>' }));

const navigate = (from: string, to: string) =>
  navigation.callbacks.forEach((callback) =>
    callback({
      from: { url: new URL(`http://localhost${from}`) },
      to: { url: new URL(`http://localhost${to}`) }
    })
  );

function scrollTo(main: HTMLElement, top: number) {
  Object.defineProperty(main, 'scrollTop', { value: top, writable: true, configurable: true });
  return fireEvent.scroll(main);
}

describe('Layout', () => {
  beforeEach(() => {
    searchQuery.value = '';
    playerState.isPlaying = false;
    pageState.url = new URL('http://localhost/');
    gotoMock.mockReset();
    navigation.callbacks = [];
  });

  it('shows the header with its navigation', () => {
    render(Layout, { children });

    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Configurações' })).toHaveAttribute(
      'href',
      '/settings'
    );
  });

  it('hides the whole header while something is playing', () => {
    playerState.isPlaying = true;
    const { container } = render(Layout, { children });

    expect(container.querySelector('header')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Configurações' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pesquisar' })).toBeNull();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('brings the header back when playback ends', async () => {
    playerState.isPlaying = true;
    const { container } = render(Layout, { children });

    playerState.isPlaying = false;
    await Promise.resolve();

    expect(container.querySelector('header')).not.toBeNull();
  });

  it('does not react to the search shortcut while playing', async () => {
    playerState.isPlaying = true;
    render(Layout, { children });

    await fireEvent.keyDown(window, { key: 'k', ctrlKey: true });

    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('keeps the opaque dark root that the window transparency rule relies on', () => {
    const { container } = render(Layout, { children });

    expect(container.firstElementChild?.classList).toContain('bg-dark');
  });

  it('lets the page show through the header at the top and turns it solid after scrolling', async () => {
    const { container } = render(Layout, { children });
    const header = container.querySelector('header')!;
    const main = container.querySelector('main')!;

    expect(header.classList).not.toContain('bg-dark');

    await scrollTo(main, 20);
    expect(header.classList).toContain('bg-dark');

    await scrollTo(main, 0);
    expect(header.classList).not.toContain('bg-dark');
  });

  it('stays transparent for a scroll of a few pixels', async () => {
    const { container } = render(Layout, { children });
    await scrollTo(container.querySelector('main')!, 8);

    expect(container.querySelector('header')?.classList).not.toContain('bg-dark');
  });

  it('keeps the header above the backdrop that title pages fix behind them', () => {
    pageState.url = new URL('http://localhost/movie/tt1');
    const { container } = render(Layout, { children });
    const header = container.querySelector('header');

    expect(header?.classList).toContain('z-20');
    expect(header?.classList).toContain('sticky');
  });

  it('starts every page at the top', async () => {
    const { container } = render(Layout, { children });
    const main = container.querySelector('main')!;
    await scrollTo(main, 300);

    navigate('/movies', '/series');

    expect(main.scrollTop).toBe(0);
    await Promise.resolve();
    expect(container.querySelector('header')?.classList).not.toContain('bg-dark');
  });

  it('copes with the first navigation, which has no page it came from', () => {
    render(Layout, { children });

    expect(() =>
      navigation.callbacks.forEach((callback) =>
        callback({ from: { url: null }, to: { url: new URL('http://localhost/') } })
      )
    ).not.toThrow();
  });

  it('keeps the scroll position when only the genre changes', async () => {
    const { container } = render(Layout, { children });
    const main = container.querySelector('main')!;
    await scrollTo(main, 300);

    navigate('/movies', '/movies?genre=Action');

    expect(main.scrollTop).toBe(300);
  });
});

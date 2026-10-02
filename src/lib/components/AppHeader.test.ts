import { render, screen, fireEvent, within } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchQuery } from '$lib/stores.svelte';

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

import AppHeader from './AppHeader.svelte';

const navigate = (from: string, to: string) =>
  navigation.callbacks.forEach((callback) =>
    callback({
      from: { url: new URL(`http://localhost${from}`) },
      to: { url: new URL(`http://localhost${to}`) }
    })
  );

const renderAt = (path: string, scrolled = false) => {
  pageState.url = new URL(`http://localhost${path}`);
  return render(AppHeader, { scrolled });
};

const mainNav = () => screen.getByRole('navigation', { name: 'Principal' });
const openSearch = () => fireEvent.click(screen.getByRole('button', { name: 'Pesquisar' }));

describe('AppHeader', () => {
  beforeEach(() => {
    searchQuery.value = '';
    pageState.url = new URL('http://localhost/');
    gotoMock.mockReset();
    navigation.callbacks = [];
  });

  describe('navigation', () => {
    it('links to the five sections', () => {
      renderAt('/');

      const links = within(mainNav()).getAllByRole('link');
      expect(links.map((l) => [l.textContent?.trim(), l.getAttribute('href')])).toEqual([
        ['Início', '/'],
        ['Séries', '/series'],
        ['Filmes', '/movies'],
        ['Novidades e Populares', '/new'],
        ['Meu Grid', '/my-grid']
      ]);
    });

    it.each([
      ['/', 'Início'],
      ['/series', 'Séries'],
      ['/series/tt1', 'Séries'],
      ['/movies', 'Filmes'],
      ['/movie/tt1', 'Filmes'],
      ['/new', 'Novidades e Populares'],
      ['/my-grid', 'Meu Grid']
    ])('marks only the section of %s as the current page', (path, label) => {
      renderAt(path);

      const current = within(mainNav())
        .getAllByRole('link')
        .filter((l) => l.getAttribute('aria-current') === 'page');
      expect(current.map((l) => l.textContent?.trim())).toEqual([label]);
    });

    it('marks no section on the settings', () => {
      renderAt('/settings');

      expect(
        within(mainNav())
          .getAllByRole('link')
          .some((l) => l.hasAttribute('aria-current'))
      ).toBe(false);
    });

    it('clears the search when the logo or a section link is clicked', async () => {
      renderAt('/movies');
      searchQuery.value = 'matrix';
      await fireEvent.click(screen.getByRole('link', { name: 'Grid' }));
      expect(searchQuery.value).toBe('');

      searchQuery.value = 'matrix';
      await fireEvent.click(within(mainNav()).getByRole('link', { name: 'Filmes' }));
      expect(searchQuery.value).toBe('');
    });

    it('gives the logo a link to the home screen', () => {
      renderAt('/series');

      expect(screen.getByRole('link', { name: 'Grid' })).toHaveAttribute('href', '/');
    });

    it('links to the settings', () => {
      renderAt('/');

      expect(screen.getByRole('link', { name: 'Configurações' })).toHaveAttribute(
        'href',
        '/settings'
      );
    });
  });

  describe('look', () => {
    it('is a gradient at the top and solid once scrolled', () => {
      const top = renderAt('/');
      expect(top.container.querySelector('header')?.classList).not.toContain('bg-dark');
      top.unmount();

      const scrolled = renderAt('/', true);
      expect(scrolled.container.querySelector('header')?.classList).toContain('bg-dark');
    });

    it('is solid while the search is open, even at the top', async () => {
      const { container } = renderAt('/');

      await openSearch();

      expect(container.querySelector('header')?.classList).toContain('bg-dark');
    });
  });

  describe('search', () => {
    it('starts collapsed as an icon button', () => {
      renderAt('/');

      expect(screen.getByRole('button', { name: 'Pesquisar' })).toBeInTheDocument();
      expect(screen.queryByRole('searchbox')).toBeNull();
    });

    it('expands and focuses the input when the icon is clicked', async () => {
      renderAt('/');

      await openSearch();

      expect(screen.getByRole('searchbox', { name: 'Pesquisar' })).toHaveFocus();
    });

    it.each([
      ['Ctrl+K', { key: 'k', ctrlKey: true }],
      ['/', { key: '/' }]
    ])('expands and focuses with %s', async (_name, init) => {
      renderAt('/');

      await fireEvent.keyDown(window, init);

      await vi.waitFor(() => expect(screen.getByRole('searchbox')).toHaveFocus());
    });

    it('leaves / alone while typing in another field', async () => {
      renderAt('/');
      const other = document.createElement('input');
      document.body.appendChild(other);
      other.focus();

      await fireEvent.keyDown(other, { key: '/' });

      expect(screen.queryByRole('searchbox')).toBeNull();
      expect(document.activeElement).toBe(other);
      other.remove();
    });

    it('collapses on blur while empty', async () => {
      renderAt('/');
      await openSearch();

      await fireEvent.blur(screen.getByRole('searchbox'));

      expect(screen.queryByRole('searchbox')).toBeNull();
    });

    it('stays open on blur while there is a query', async () => {
      renderAt('/');
      await openSearch();
      await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'matrix' } });

      await fireEvent.blur(screen.getByRole('searchbox'));

      expect(screen.getByRole('searchbox')).toHaveValue('matrix');
    });

    it('clears and collapses on Escape', async () => {
      renderAt('/movies');
      await openSearch();
      await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'matrix' } });

      await fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });

      expect(searchQuery.value).toBe('');
      expect(screen.queryByRole('searchbox')).toBeNull();
      expect(screen.getByRole('button', { name: 'Pesquisar' })).toHaveFocus();
    });

    it('stays open with a query set elsewhere', () => {
      searchQuery.value = 'matrix';
      renderAt('/');

      expect(screen.getByRole('searchbox')).toHaveValue('matrix');
    });

    it('clears the query with the clear button but stays open', async () => {
      renderAt('/');
      await openSearch();
      await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'matrix' } });

      await fireEvent.click(screen.getByRole('button', { name: 'Limpar pesquisa' }));

      expect(searchQuery.value).toBe('');
      expect(screen.getByRole('searchbox')).toBeInTheDocument();
    });

    it.each([
      ['/movies', 'Buscar filmes'],
      ['/series', 'Buscar séries'],
      ['/', 'Buscar filmes e séries'],
      ['/new', 'Buscar filmes e séries'],
      ['/series/tt1', 'Buscar filmes e séries'],
      ['/settings', 'Buscar filmes e séries']
    ])('shows the %s placeholder', async (path, placeholder) => {
      renderAt(path);
      await openSearch();

      expect(screen.getByRole('searchbox')).toHaveAttribute('placeholder', placeholder);
    });

    it.each(['/movies', '/series'])('searches in place on %s', async (path) => {
      renderAt(path);
      await openSearch();

      await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'matrix' } });

      expect(searchQuery.value).toBe('matrix');
      expect(gotoMock).not.toHaveBeenCalled();
    });

    it.each(['/movie/tt1', '/series/tt2', '/settings', '/new', '/my-grid'])(
      'takes a search typed on %s to the home screen',
      async (path) => {
        renderAt(path);
        await openSearch();

        await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'matrix' } });

        expect(gotoMock).toHaveBeenCalledWith('/');
      }
    );

    it('stays on the home screen while searching there', async () => {
      renderAt('/');
      await openSearch();

      await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'matrix' } });

      expect(gotoMock).not.toHaveBeenCalled();
    });

    it('clears the search when the page changes', () => {
      searchQuery.value = 'matrix';
      renderAt('/movies');

      navigate('/movies', '/series');

      expect(searchQuery.value).toBe('');
    });

    it('keeps the query when the header mounts again after playback, which has no page it came from', () => {
      searchQuery.value = 'matrix';
      renderAt('/');

      navigation.callbacks.forEach((callback) =>
        callback({ from: null, to: { url: new URL('http://localhost/') } })
      );

      expect(searchQuery.value).toBe('matrix');
    });

    it('keeps the search when only the genre changes', () => {
      searchQuery.value = 'matrix';
      renderAt('/movies');

      navigate('/movies', '/movies?genre=Action');

      expect(searchQuery.value).toBe('matrix');
    });

    it('keeps the search that sent the user to the results on the home screen', async () => {
      renderAt('/settings');
      await openSearch();
      await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'matrix' } });

      navigate('/settings', '/');

      expect(searchQuery.value).toBe('matrix');
    });
  });

  describe('narrow menu', () => {
    const menuButton = () => screen.getByRole('button', { name: 'Navegar' });

    it('starts closed', () => {
      renderAt('/');

      expect(menuButton()).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('navigation', { name: 'Menu principal' })).toBeNull();
    });

    it('lists the same five links with the current one marked', async () => {
      renderAt('/series');
      await fireEvent.click(menuButton());

      const menu = screen.getByRole('navigation', { name: 'Menu principal' });
      expect(menuButton()).toHaveAttribute('aria-expanded', 'true');
      expect(menuButton()).toHaveAttribute('aria-controls', menu.id);
      expect(
        within(menu)
          .getAllByRole('link')
          .map((l) => l.textContent?.trim())
      ).toEqual(['Início', 'Séries', 'Filmes', 'Novidades e Populares', 'Meu Grid']);
      expect(within(menu).getByRole('link', { name: 'Séries' })).toHaveAttribute(
        'aria-current',
        'page'
      );
    });

    it('is solid while open', async () => {
      const { container } = renderAt('/');

      await fireEvent.click(menuButton());

      expect(container.querySelector('header')?.classList).toContain('bg-dark');
    });

    it('closes on Escape and gives the focus back to the button', async () => {
      renderAt('/');
      await fireEvent.click(menuButton());

      await fireEvent.keyDown(window, { key: 'Escape' });

      expect(screen.queryByRole('navigation', { name: 'Menu principal' })).toBeNull();
      expect(menuButton()).toHaveFocus();
    });

    it('closes when a link is chosen', async () => {
      renderAt('/');
      await fireEvent.click(menuButton());

      await fireEvent.click(
        within(screen.getByRole('navigation', { name: 'Menu principal' })).getByRole('link', {
          name: 'Filmes'
        })
      );

      expect(screen.queryByRole('navigation', { name: 'Menu principal' })).toBeNull();
    });

    it('closes when clicking elsewhere', async () => {
      renderAt('/');
      await fireEvent.click(menuButton());

      await fireEvent.click(document.body);

      expect(screen.queryByRole('navigation', { name: 'Menu principal' })).toBeNull();
    });
  });
});

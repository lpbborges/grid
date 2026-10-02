import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import GenreSelector from './GenreSelector.svelte';

const key = (name: string) => fireEvent.keyDown(document.activeElement as Element, { key: name });

describe('GenreSelector', () => {
  it('starts closed with the Gêneros button', () => {
    render(GenreSelector, { type: 'movie', genre: null, onselect: vi.fn() });

    const button = screen.getByRole('button', { name: 'Gêneros' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('lists every genre in pt-BR with Todos os gêneros first and selected', async () => {
    render(GenreSelector, { type: 'movie', genre: null, onselect: vi.fn() });

    await fireEvent.click(screen.getByRole('button', { name: 'Gêneros' }));

    const items = screen.getAllByRole('menuitemradio');
    expect(items[0]).toHaveTextContent('Todos os gêneros');
    expect(items[0]).toHaveAttribute('aria-checked', 'true');
    expect(items.map((i) => i.textContent?.trim())).toContain('Ficção científica');
    expect(items.map((i) => i.textContent?.trim())).not.toContain('Reality show');
  });

  it('lists the series-only genres for series', async () => {
    render(GenreSelector, { type: 'series', genre: null, onselect: vi.fn() });

    await fireEvent.click(screen.getByRole('button', { name: 'Gêneros' }));

    expect(screen.getByRole('menuitemradio', { name: 'Reality show' })).toBeInTheDocument();
  });

  it('picks a genre by its Cinemeta id and closes', async () => {
    const onselect = vi.fn();
    render(GenreSelector, { type: 'movie', genre: null, onselect });

    await fireEvent.click(screen.getByRole('button', { name: 'Gêneros' }));
    await fireEvent.click(screen.getByRole('menuitemradio', { name: 'Ficção científica' }));

    expect(onselect).toHaveBeenCalledWith('Sci-Fi');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('button', { name: 'Gêneros' })).toHaveFocus();
  });

  it('marks the active genre and offers a quick way to clear it', async () => {
    const onselect = vi.fn();
    render(GenreSelector, { type: 'movie', genre: 'Action', onselect });

    await fireEvent.click(screen.getByRole('button', { name: 'Limpar gênero' }));
    expect(onselect).toHaveBeenCalledWith(null);

    await fireEvent.click(screen.getByRole('button', { name: 'Ação', expanded: false }));
    expect(screen.getByRole('menuitemradio', { name: /Ação/ })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('chooses Todos os gêneros to clear the filter', async () => {
    const onselect = vi.fn();
    render(GenreSelector, { type: 'movie', genre: 'Action', onselect });

    await fireEvent.click(screen.getByRole('button', { name: 'Ação', expanded: false }));
    await fireEvent.click(screen.getByRole('menuitemradio', { name: 'Todos os gêneros' }));

    expect(onselect).toHaveBeenCalledWith(null);
  });

  it('moves focus with the arrow keys, picks the focused genre and closes with Escape', async () => {
    const onselect = vi.fn();
    render(GenreSelector, { type: 'movie', genre: null, onselect });

    await fireEvent.click(screen.getByRole('button', { name: 'Gêneros' }));
    await vi.waitFor(() =>
      expect(screen.getByRole('menuitemradio', { name: 'Todos os gêneros' })).toHaveFocus()
    );
    await key('ArrowRight');
    expect(screen.getByRole('menuitemradio', { name: 'Ação' })).toHaveFocus();
    await key('ArrowDown');
    expect(screen.getAllByRole('menuitemradio')[4]).toHaveFocus();
    await key('ArrowLeft');
    await key('ArrowUp');
    expect(screen.getAllByRole('menuitemradio')[0]).toHaveFocus();
    await key('ArrowRight');
    await fireEvent.click(document.activeElement as Element);
    expect(onselect).toHaveBeenCalledWith('Action');

    await fireEvent.click(screen.getByRole('button', { name: 'Gêneros' }));
    await key('Escape');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('button', { name: 'Gêneros' })).toHaveFocus();
  });

  it('closes when clicking elsewhere', async () => {
    render(GenreSelector, { type: 'movie', genre: null, onselect: vi.fn() });

    await fireEvent.click(screen.getByRole('button', { name: 'Gêneros' }));
    await fireEvent.click(document.body);

    expect(screen.queryByRole('menu')).toBeNull();
  });
});

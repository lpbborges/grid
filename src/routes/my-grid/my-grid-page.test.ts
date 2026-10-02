import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/svelte';
import MyGridPage from './+page.svelte';
import { listsStore } from '$lib/stores/lists.svelte';
import { progressStore } from '$lib/stores/progress.svelte';
import { UNDO_TOAST_DURATION_MS } from '$lib/components/UndoToast.svelte';

const meta = { type: 'movie' as const, title: 'Filme', poster: 'm.jpg' };

describe('My Grid page', () => {
  beforeEach(() => {
    localStorage.clear();
    listsStore.lists = [
      { id: 'favorites', name: 'Favoritos', system: 'favorites', updatedAt: 0, items: [] },
      { id: 'watch-later', name: 'Assistir depois', system: 'watch-later', updatedAt: 0, items: [] }
    ];
    progressStore.progress = {};
  });

  it('is titled Meu Grid', () => {
    render(MyGridPage);

    expect(screen.getByRole('heading', { level: 1, name: 'Meu Grid' })).toBeInTheDocument();
  });

  it('shows Favoritos and the lists of the user even when empty, but not an empty Assistir depois', () => {
    listsStore.create('Cinema');
    render(MyGridPage);

    expect(screen.getByRole('heading', { name: 'Favoritos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cinema' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Assistir depois' })).toBeNull();
    expect(screen.getAllByText('Nenhum título nesta lista ainda')).toHaveLength(2);
    expect(screen.queryByText('Continuar assistindo')).toBeNull();
  });

  it('does not show Continuar assistindo, which lives on the home page', () => {
    progressStore.progress = { tt2: { time: 60, duration: 600, updatedAt: 1, meta } };

    render(MyGridPage);

    expect(screen.queryByText('Continuar assistindo')).toBeNull();
    expect(screen.queryByRole('button', { name: /Remover de Continuar/ })).toBeNull();
    const headings = screen.getAllByRole('heading').map((h) => h.textContent?.trim());
    expect(headings.slice(0, 2)).toEqual(['Meu Grid', 'Favoritos']);
  });

  it('shows Assistir depois as soon as it gets a title', async () => {
    render(MyGridPage);

    await act(() => listsStore.add('watch-later', 'tt1', meta));

    expect(screen.getByRole('heading', { name: 'Assistir depois' })).toBeInTheDocument();
    expect(screen.getAllByText('Filme')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Nenhum título nesta lista ainda')).toHaveLength(1);
  });

  it('keeps Assistir depois once it has a title, then shows it again only when it has one', async () => {
    listsStore.add('watch-later', 'tt1', meta);
    render(MyGridPage);
    expect(screen.getByRole('heading', { name: 'Assistir depois' })).toBeInTheDocument();

    await act(() => listsStore.removeItem('watch-later', 'tt1'));

    expect(screen.queryByRole('heading', { name: 'Assistir depois' })).toBeNull();
  });

  it('orders the lists by the last update, most recent first', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    listsStore.add('favorites', 'tt1', meta);
    vi.setSystemTime(2000);
    const created = listsStore.create('Cinema');
    vi.setSystemTime(3000);
    listsStore.add('watch-later', 'tt2', meta);
    vi.useRealTimers();
    render(MyGridPage);

    const lists = () =>
      screen.getAllByRole('region').map((section) => section.getAttribute('aria-label'));
    expect(lists()).toEqual(['Assistir depois', 'Cinema', 'Favoritos']);

    await act(() => listsStore.add('favorites', 'tt3', meta));
    expect(lists()).toEqual(['Favoritos', 'Assistir depois', 'Cinema']);
    expect(created.ok).toBe(true);
  });

  it('creates a list from the page', async () => {
    render(MyGridPage);

    await fireEvent.click(screen.getByRole('button', { name: 'Nova lista' }));
    const input = screen.getByRole('textbox', { name: 'Nome da nova lista' });
    await fireEvent.input(input, { target: { value: 'Cinema' } });
    await fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByRole('heading', { name: 'Cinema' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('explains a refused name and creates nothing', async () => {
    render(MyGridPage);

    await fireEvent.click(screen.getByRole('button', { name: 'Nova lista' }));
    await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'FAVORITOS' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Criar' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Já existe uma lista com esse nome.');
    expect(listsStore.lists).toHaveLength(2);
  });

  it('cancels the new list form', async () => {
    render(MyGridPage);

    await fireEvent.click(screen.getByRole('button', { name: 'Nova lista' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Nova lista' })).toBeInTheDocument();
  });

  it('deletes a list and offers to undo, bringing back its titles', async () => {
    const created = listsStore.create('Cinema');
    if (!created.ok) throw new Error('create failed');
    listsStore.add(created.list.id, 'tt1', meta);
    render(MyGridPage);

    await fireEvent.click(screen.getByRole('button', { name: 'Opções de Cinema' }));
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir' }));

    expect(screen.queryByRole('heading', { name: 'Cinema' })).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Lista excluída');

    await fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));

    expect(screen.getByRole('heading', { name: 'Cinema' })).toBeInTheDocument();
    expect(listsStore.has(created.list.id, 'tt1')).toBe(true);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('lets the deletion stand once the toast runs out', async () => {
    vi.useFakeTimers();
    const created = listsStore.create('Cinema');
    if (!created.ok) throw new Error('create failed');
    render(MyGridPage);

    await fireEvent.click(screen.getByRole('button', { name: 'Opções de Cinema' }));
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir' }));
    await vi.advanceTimersByTimeAsync(UNDO_TOAST_DURATION_MS + 100);

    expect(screen.queryByRole('status')).toBeNull();
    expect(listsStore.get(created.list.id)).toBeUndefined();
    vi.useRealTimers();
  });
});

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
      { id: 'favorites', name: 'Favoritos', system: 'favorites', items: [] },
      { id: 'watch-later', name: 'Assistir depois', system: 'watch-later', items: [] }
    ];
    progressStore.progress = {};
  });

  it('is titled Meu Grid', () => {
    render(MyGridPage);

    expect(screen.getByRole('heading', { level: 1, name: 'Meu Grid' })).toBeInTheDocument();
  });

  it('shows every list, including the empty ones, each with an empty state', () => {
    render(MyGridPage);

    expect(screen.getByRole('heading', { name: 'Favoritos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Assistir depois' })).toBeInTheDocument();
    expect(screen.getAllByText('Nenhum título nesta lista ainda')).toHaveLength(2);
    expect(screen.queryByText('Continuar assistindo')).toBeNull();
  });

  it('shows Continuar assistindo above the lists when something is in progress', () => {
    progressStore.progress = { tt2: { time: 60, duration: 600, updatedAt: 1, meta } };

    render(MyGridPage);

    const headings = screen.getAllByRole('heading').map((h) => h.textContent?.trim());
    expect(headings.slice(1, 4)).toEqual(['Continuar assistindo', 'Favoritos', 'Assistir depois']);
  });

  it('lists the titles of each list and updates when one is added', async () => {
    render(MyGridPage);

    await act(() => listsStore.add('watch-later', 'tt1', meta));

    expect(screen.getAllByText('Filme')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Nenhum título nesta lista ainda')).toHaveLength(1);
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

    await fireEvent.click(screen.getByRole('button', { name: 'Excluir Cinema' }));

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

    await fireEvent.click(screen.getByRole('button', { name: 'Excluir Cinema' }));
    await vi.advanceTimersByTimeAsync(UNDO_TOAST_DURATION_MS + 100);

    expect(screen.queryByRole('status')).toBeNull();
    expect(listsStore.get(created.list.id)).toBeUndefined();
    vi.useRealTimers();
  });
});

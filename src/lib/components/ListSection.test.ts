import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ListSection from './ListSection.svelte';
import { listsStore } from '$lib/stores/lists.svelte';

const meta = (title: string) => ({ type: 'movie' as const, title, poster: 'p.jpg' });

function customList() {
  const result = listsStore.create('Cinema');
  if (!result.ok) throw new Error('create failed');
  return result.list.id;
}

describe('ListSection', () => {
  beforeEach(() => {
    localStorage.clear();
    listsStore.lists = [
      { id: 'favorites', name: 'Favoritos', system: 'favorites', items: [] },
      { id: 'watch-later', name: 'Assistir depois', system: 'watch-later', items: [] }
    ];
  });

  it('shows an empty state for a list with no titles', () => {
    render(ListSection, { list: listsStore.lists[0], ondelete: vi.fn() });

    expect(screen.getByRole('heading', { name: 'Favoritos' })).toBeInTheDocument();
    expect(screen.getByText('Nenhum título nesta lista ainda')).toBeInTheDocument();
  });

  it('lists the titles newest first with a card link each', () => {
    listsStore.add('favorites', 'tt1', meta('Primeiro'));
    listsStore.add('favorites', 'tt2', meta('Segundo'));
    render(ListSection, { list: listsStore.lists[0], ondelete: vi.fn() });

    const cards = screen.getAllByTestId('media-card');
    expect(cards.map((card) => card.getAttribute('href'))).toEqual(['/movie/tt2', '/movie/tt1']);
    expect(screen.queryByText('Nenhum título nesta lista ainda')).toBeNull();
  });

  it('removes a title from this list only', async () => {
    listsStore.add('favorites', 'tt1', meta('Filme'));
    listsStore.add('watch-later', 'tt1', meta('Filme'));
    render(ListSection, { list: listsStore.lists[0], ondelete: vi.fn() });

    await fireEvent.click(screen.getByRole('button', { name: 'Remover de Favoritos' }));

    expect(listsStore.has('favorites', 'tt1')).toBe(false);
    expect(listsStore.has('watch-later', 'tt1')).toBe(true);
  });

  it('offers no rename or delete for a default list', () => {
    render(ListSection, { list: listsStore.lists[1], ondelete: vi.fn() });

    expect(screen.queryByRole('button', { name: /Renomear/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Excluir/ })).toBeNull();
  });

  it('renames a list of the user', async () => {
    const id = customList();
    render(ListSection, { list: listsStore.get(id)!, ondelete: vi.fn() });

    await fireEvent.click(screen.getByRole('button', { name: 'Renomear Cinema' }));
    const input = screen.getByRole('textbox', { name: 'Novo nome da lista' });
    expect(input).toHaveValue('Cinema');
    await fireEvent.input(input, { target: { value: ' Maratona ' } });
    await fireEvent.keyDown(input, { key: 'Enter' });

    expect(listsStore.get(id)?.name).toBe('Maratona');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('keeps the rename form open with the reason when the name is refused', async () => {
    const id = customList();
    render(ListSection, { list: listsStore.get(id)!, ondelete: vi.fn() });

    await fireEvent.click(screen.getByRole('button', { name: 'Renomear Cinema' }));
    await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'favoritos' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Já existe uma lista com esse nome.');
    expect(listsStore.get(id)?.name).toBe('Cinema');
  });

  it('cancels a rename with Escape', async () => {
    const id = customList();
    render(ListSection, { list: listsStore.get(id)!, ondelete: vi.fn() });

    await fireEvent.click(screen.getByRole('button', { name: 'Renomear Cinema' }));
    await fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Cinema' })).toBeInTheDocument();
  });

  it('hands the deleted list over so the page can offer to undo', async () => {
    const id = customList();
    const ondelete = vi.fn();
    render(ListSection, { list: listsStore.get(id)!, ondelete });

    await fireEvent.click(screen.getByRole('button', { name: 'Excluir Cinema' }));

    expect(ondelete).toHaveBeenCalledWith(
      expect.objectContaining({ list: expect.objectContaining({ id }) })
    );
    expect(listsStore.get(id)).toBeUndefined();
  });
});

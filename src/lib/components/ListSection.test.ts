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
      { id: 'favorites', name: 'Favoritos', system: 'favorites', updatedAt: 0, items: [] },
      { id: 'watch-later', name: 'Assistir depois', system: 'watch-later', updatedAt: 0, items: [] }
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

  it('has no remove button on the cards', () => {
    listsStore.add('favorites', 'tt1', meta('Filme'));
    render(ListSection, { list: listsStore.lists[0], ondelete: vi.fn() });

    expect(screen.queryByRole('button', { name: /Remover de/ })).toBeNull();
  });

  const openOptions = (name: string) =>
    fireEvent.click(screen.getByRole('button', { name: `Opções de ${name}` }));

  it('has no rename or delete buttons in the heading, only an options button', () => {
    const id = customList();
    render(ListSection, { list: listsStore.get(id)!, ondelete: vi.fn() });

    expect(screen.getByRole('button', { name: 'Opções de Cinema' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.queryByRole('button', { name: /Renomear|Excluir/ })).toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('offers no options for a default list', () => {
    render(ListSection, { list: listsStore.lists[1], ondelete: vi.fn() });

    expect(screen.queryByRole('button', { name: /Opções/ })).toBeNull();
  });

  it('opens a dropdown with rename and delete, focusing the first option', async () => {
    const id = customList();
    render(ListSection, { list: listsStore.get(id)!, ondelete: vi.fn() });

    await openOptions('Cinema');

    expect(screen.getByRole('button', { name: 'Opções de Cinema' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent?.trim())).toEqual([
      'Renomear',
      'Excluir'
    ]);
    expect(screen.getByRole('menuitem', { name: 'Renomear' })).toHaveFocus();
  });

  it('moves between the options with the arrow keys', async () => {
    const id = customList();
    render(ListSection, { list: listsStore.get(id)!, ondelete: vi.fn() });
    await openOptions('Cinema');

    await fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Excluir' })).toHaveFocus();

    await fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowUp' });
    expect(screen.getByRole('menuitem', { name: 'Renomear' })).toHaveFocus();
  });

  it('closes with Escape, giving the focus back, and when the user clicks elsewhere', async () => {
    const id = customList();
    render(ListSection, { list: listsStore.get(id)!, ondelete: vi.fn() });

    await openOptions('Cinema');
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('button', { name: 'Opções de Cinema' })).toHaveFocus();

    await openOptions('Cinema');
    await fireEvent.click(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('stays open for the click that opened it and for clicks inside', async () => {
    const id = customList();
    render(ListSection, { list: listsStore.get(id)!, ondelete: vi.fn() });

    await openOptions('Cinema');
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('menu'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('wraps around at both ends of the options', async () => {
    const id = customList();
    render(ListSection, { list: listsStore.get(id)!, ondelete: vi.fn() });
    await openOptions('Cinema');

    await fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowUp' });
    expect(screen.getByRole('menuitem', { name: 'Excluir' })).toHaveFocus();

    await fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Renomear' })).toHaveFocus();
  });

  it('does not take the focus back when the user clicks elsewhere', async () => {
    const id = customList();
    render(ListSection, { list: listsStore.get(id)!, ondelete: vi.fn() });
    const outside = document.createElement('button');
    document.body.append(outside);

    await openOptions('Cinema');
    outside.focus();
    await fireEvent.click(outside);

    expect(screen.queryByRole('menu')).toBeNull();
    expect(outside).toHaveFocus();
    outside.remove();
  });

  it('renames a list of the user', async () => {
    const id = customList();
    render(ListSection, { list: listsStore.get(id)!, ondelete: vi.fn() });

    await openOptions('Cinema');
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Renomear' }));
    expect(screen.queryByRole('menu')).toBeNull();
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

    await openOptions('Cinema');
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Renomear' }));
    await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'favoritos' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Já existe uma lista com esse nome.');
    expect(listsStore.get(id)?.name).toBe('Cinema');
  });

  it('cancels a rename with Escape', async () => {
    const id = customList();
    render(ListSection, { list: listsStore.get(id)!, ondelete: vi.fn() });

    await openOptions('Cinema');
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Renomear' }));
    await fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Cinema' })).toBeInTheDocument();
  });

  it('hands the deleted list over so the page can offer to undo', async () => {
    const id = customList();
    const ondelete = vi.fn();
    render(ListSection, { list: listsStore.get(id)!, ondelete });

    await openOptions('Cinema');
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir' }));

    expect(ondelete).toHaveBeenCalledWith(
      expect.objectContaining({ list: expect.objectContaining({ id }) })
    );
    expect(listsStore.get(id)).toBeUndefined();
  });
});

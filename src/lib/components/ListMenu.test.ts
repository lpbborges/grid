import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import ListMenu from './ListMenu.svelte';
import { listsStore } from '$lib/stores/lists.svelte';

const meta = { type: 'movie' as const, title: 'Filme', poster: 'm.jpg' };

function open() {
  render(ListMenu, { id: 'tt1', meta });
  return fireEvent.click(screen.getByRole('button', { name: 'Adicionar a uma lista' }));
}

describe('ListMenu', () => {
  beforeEach(() => {
    localStorage.clear();
    listsStore.lists = listsStore.lists.filter((list) => list.system);
    listsStore.lists.forEach((list) => (list.items = []));
  });

  it('is closed until the button is pressed', async () => {
    render(ListMenu, { id: 'tt1', meta });
    const button = screen.getByRole('button', { name: 'Adicionar a uma lista' });

    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('group', { name: 'Listas' })).toBeNull();

    await fireEvent.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('group', { name: 'Listas' })).toBeInTheDocument();
  });

  it('offers a checkbox per list, checked for the lists that hold the title', async () => {
    listsStore.add('watch-later', 'tt1', meta);
    await open();

    expect(screen.getByRole('checkbox', { name: 'Favoritos' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Assistir depois' })).toBeChecked();
  });

  it('puts the title in several lists and takes it out again', async () => {
    await open();

    await fireEvent.click(screen.getByRole('checkbox', { name: 'Favoritos' }));
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Assistir depois' }));
    expect(listsStore.has('favorites', 'tt1')).toBe(true);
    expect(listsStore.has('watch-later', 'tt1')).toBe(true);
    expect(listsStore.get('favorites')?.items[0].meta).toEqual(meta);

    await fireEvent.click(screen.getByRole('checkbox', { name: 'Favoritos' }));
    expect(listsStore.has('favorites', 'tt1')).toBe(false);
    expect(listsStore.has('watch-later', 'tt1')).toBe(true);
  });

  it('creates a list from the menu and adds the title to it', async () => {
    await open();

    await fireEvent.click(screen.getByRole('button', { name: 'Nova lista' }));
    await fireEvent.input(screen.getByRole('textbox', { name: 'Nome da nova lista' }), {
      target: { value: ' Fim de semana ' }
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Criar' }));

    const created = listsStore.lists.find((list) => list.name === 'Fim de semana');
    expect(created?.items.map((item) => item.id)).toEqual(['tt1']);
    expect(screen.getByRole('checkbox', { name: 'Fim de semana' })).toBeChecked();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('creates the list with Enter', async () => {
    await open();
    await fireEvent.click(screen.getByRole('button', { name: 'Nova lista' }));
    const input = screen.getByRole('textbox', { name: 'Nome da nova lista' });

    await fireEvent.input(input, { target: { value: 'Clássicos' } });
    await fireEvent.keyDown(input, { key: 'Enter' });

    expect(listsStore.lists.some((list) => list.name === 'Clássicos')).toBe(true);
  });

  it('explains why a name is refused and keeps the form open', async () => {
    await open();
    await fireEvent.click(screen.getByRole('button', { name: 'Nova lista' }));
    const input = screen.getByRole('textbox', { name: 'Nome da nova lista' });

    await fireEvent.input(input, { target: { value: 'favoritos' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Criar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Já existe uma lista com esse nome.');

    await fireEvent.input(input, { target: { value: '   ' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Criar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Dê um nome à lista.');

    await fireEvent.input(input, { target: { value: 'Outra' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(listsStore.lists).toHaveLength(2);
  });

  it('closes with Escape and gives the focus back to the button', async () => {
    await open();

    await fireEvent.keyDown(window, { key: 'Escape' });
    await tick();

    const button = screen.getByRole('button', { name: 'Adicionar a uma lista' });
    expect(screen.queryByRole('group', { name: 'Listas' })).toBeNull();
    expect(button).toHaveFocus();
  });

  it('closes when the user clicks elsewhere, but not inside the menu', async () => {
    await open();

    await fireEvent.click(screen.getByRole('group', { name: 'Listas' }));
    expect(screen.getByRole('group', { name: 'Listas' })).toBeInTheDocument();

    await fireEvent.click(document.body);
    expect(screen.queryByRole('group', { name: 'Listas' })).toBeNull();
  });

  it('stays open when the pressed button leaves the page before the click reaches the window', async () => {
    await open();
    const newList = screen.getByRole('button', { name: 'Nova lista' });
    newList.addEventListener('click', () => newList.remove());

    newList.click();
    await tick();

    expect(screen.getByRole('textbox', { name: 'Nome da nova lista' })).toBeInTheDocument();
  });

  it('forgets a half-typed name when it closes', async () => {
    await open();
    await fireEvent.click(screen.getByRole('button', { name: 'Nova lista' }));
    await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Meio' } });

    await fireEvent.click(document.body);
    await fireEvent.click(screen.getByRole('button', { name: 'Adicionar a uma lista' }));

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Nova lista' })).toBeInTheDocument();
  });
});

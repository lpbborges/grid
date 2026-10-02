import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MAX_LIST_NAME_LENGTH } from './lists.svelte';

const movieMeta = { type: 'movie' as const, title: 'Filme', poster: 'm.jpg' };
const seriesMeta = { type: 'series' as const, title: 'Série', poster: 's.jpg' };

async function freshStore() {
  vi.resetModules();
  const { listsStore: fresh } = await import('./lists.svelte');
  return fresh;
}

type Store = Awaited<ReturnType<typeof freshStore>>;

const names = (store: Store) => store.lists.map((list) => list.name);

describe('listsStore', () => {
  let store: Store;

  beforeEach(async () => {
    localStorage.clear();
    store = await freshStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loading', () => {
    it('starts with the two default lists', () => {
      expect(store.lists).toMatchObject([
        { id: 'favorites', name: 'Favoritos', system: 'favorites', items: [] },
        { id: 'watch-later', name: 'Assistir depois', system: 'watch-later', items: [] }
      ]);
    });

    it.each([
      ['not json', '{oops'],
      ['not an array', '{"a":1}'],
      ['an empty array', '[]'],
      ['a list of nulls', '[null, 3]']
    ])('falls back to the default lists when the stored value is %s', async (_, stored) => {
      localStorage.setItem('grid-lists', stored);

      expect(names(await freshStore())).toEqual(['Favoritos', 'Assistir depois']);
    });

    it('restores a default list that is missing and keeps the defaults first', async () => {
      localStorage.setItem(
        'grid-lists',
        JSON.stringify([
          { id: 'mine', name: 'Minha', items: [] },
          { id: 'watch-later', name: 'Renomeada', system: 'watch-later', items: [] }
        ])
      );

      expect(names(await freshStore())).toEqual(['Favoritos', 'Assistir depois', 'Minha']);
    });

    it('drops invalid items and snapshots but keeps valid ones', async () => {
      localStorage.setItem(
        'grid-lists',
        JSON.stringify([
          {
            id: 'favorites',
            name: 'x',
            system: 'favorites',
            items: [
              { id: 'tt1', addedAt: 5, meta: movieMeta },
              { id: 'tt2', addedAt: 6, meta: { type: 'show', title: 'X', poster: '' } },
              { id: 7, addedAt: 1 },
              { id: 'tt3' },
              null
            ]
          }
        ])
      );

      const fresh = await freshStore();

      expect(fresh.get('favorites')?.items).toEqual([
        { id: 'tt1', addedAt: 5, meta: movieMeta },
        { id: 'tt2', addedAt: 6 }
      ]);
    });

    it('ignores stored lists whose name is invalid or repeated', async () => {
      localStorage.setItem(
        'grid-lists',
        JSON.stringify([
          { id: 'a', name: '   ', items: [] },
          { id: 'b', name: 'Cinema', items: [] },
          { id: 'c', name: 'cinema', items: [] },
          { id: 'd', name: 'Favoritos', items: [] },
          { id: 'b', name: 'Outra', items: [] }
        ])
      );

      expect(names(await freshStore())).toEqual(['Favoritos', 'Assistir depois', 'Cinema']);
    });

    it('moves the old favorites into Favoritos, in order and with their snapshots', async () => {
      localStorage.setItem(
        'grid-favorites',
        JSON.stringify(['tt1', 7, { id: 'tt2', meta: movieMeta }, { meta: movieMeta }, null])
      );

      const fresh = await freshStore();
      const favorites = fresh.get('favorites')!;

      expect(favorites.items.map(({ id, meta }) => ({ id, meta }))).toEqual([
        { id: 'tt1', meta: undefined },
        { id: '7', meta: undefined },
        { id: 'tt2', meta: movieMeta }
      ]);
      expect(fresh.titled('favorites').map((item) => item.id)).toEqual(['tt2']);
      const times = favorites.items.map((item) => item.addedAt);
      expect(times).toEqual([...times].sort((a, b) => a - b));
    });

    it('stops reading the old key after moving it', async () => {
      localStorage.setItem('grid-favorites', JSON.stringify(['tt1']));
      await freshStore();

      expect(localStorage.getItem('grid-favorites')).toBeNull();
      expect(JSON.parse(localStorage.getItem('grid-lists')!)[0].items).toHaveLength(1);

      localStorage.setItem('grid-favorites', JSON.stringify(['tt9']));
      expect((await freshStore()).get('favorites')?.items.map((item) => item.id)).toEqual(['tt1']);
    });
  });

  describe('creating, renaming and deleting', () => {
    it('creates a list with a trimmed name after the existing ones', () => {
      const result = store.create('  Para o fim de semana ');

      expect(result).toMatchObject({ ok: true, list: { name: 'Para o fim de semana', items: [] } });
      expect(names(store)).toEqual(['Favoritos', 'Assistir depois', 'Para o fim de semana']);
    });

    it('rejects an empty name', () => {
      expect(store.create('   ')).toEqual({ ok: false, error: 'Dê um nome à lista.' });
    });

    it('rejects a name that is already used, ignoring case and surrounding spaces', () => {
      store.create('Cinema');

      expect(store.create(' cinema ')).toEqual({
        ok: false,
        error: 'Já existe uma lista com esse nome.'
      });
      expect(store.create('FAVORITOS')).toMatchObject({ ok: false });
    });

    it('rejects a name over the length cap', () => {
      const result = store.create('a'.repeat(MAX_LIST_NAME_LENGTH + 1));

      expect(result).toEqual({
        ok: false,
        error: `Use até ${MAX_LIST_NAME_LENGTH} caracteres.`
      });
      expect(store.create('a'.repeat(MAX_LIST_NAME_LENGTH)).ok).toBe(true);
    });

    it('renames a list, and may keep its own name with another case', () => {
      const created = store.create('Cinema');
      if (!created.ok) throw new Error('create failed');

      expect(store.rename(created.list.id, 'CINEMA').ok).toBe(true);
      expect(store.get(created.list.id)?.name).toBe('CINEMA');
      expect(store.rename(created.list.id, 'Favoritos')).toMatchObject({ ok: false });
    });

    it('never renames or deletes a default list', () => {
      expect(store.rename('favorites', 'Outra')).toMatchObject({ ok: false });
      expect(store.remove('watch-later')).toBeNull();

      expect(names(store)).toEqual(['Favoritos', 'Assistir depois']);
    });

    it('deletes a list and restores it where it was, with its titles', () => {
      const a = store.create('A');
      const b = store.create('B');
      if (!a.ok || !b.ok) throw new Error('create failed');
      store.add(a.list.id, 'tt1', movieMeta);

      const removed = store.remove(a.list.id)!;
      expect(names(store)).toEqual(['Favoritos', 'Assistir depois', 'B']);

      store.restore(removed);
      expect(names(store)).toEqual(['Favoritos', 'Assistir depois', 'A', 'B']);
      expect(store.has(a.list.id, 'tt1')).toBe(true);
    });

    it('does not restore a list whose name was taken in the meantime', () => {
      const a = store.create('A');
      if (!a.ok) throw new Error('create failed');
      const removed = store.remove(a.list.id)!;
      store.create('a');

      store.restore(removed);

      expect(names(store)).toEqual(['Favoritos', 'Assistir depois', 'a']);
    });
  });

  describe('titles', () => {
    it('adds a title once, to one list at a time', () => {
      store.add('favorites', 'tt1', movieMeta);
      store.add('favorites', 'tt1', movieMeta);
      store.add('watch-later', 'tt1', movieMeta);

      expect(store.get('favorites')?.items).toHaveLength(1);
      expect(store.has('favorites', 'tt1')).toBe(true);
      expect(store.has('watch-later', 'tt1')).toBe(true);
      expect(store.has('favorites', 'tt2')).toBe(false);
    });

    it('ignores an unknown list', () => {
      expect(() => store.add('nope', 'tt1', movieMeta)).not.toThrow();
      expect(store.has('nope', 'tt1')).toBe(false);
    });

    it('toggles membership of a single list', () => {
      store.toggle('favorites', 'tt1', movieMeta);
      expect(store.has('favorites', 'tt1')).toBe(true);

      store.toggle('favorites', 'tt1', movieMeta);
      expect(store.has('favorites', 'tt1')).toBe(false);
    });

    it('removes a title from one list only', () => {
      store.add('favorites', 'tt1', movieMeta);
      store.add('watch-later', 'tt1', movieMeta);

      store.removeItem('favorites', 'tt1');

      expect(store.has('favorites', 'tt1')).toBe(false);
      expect(store.has('watch-later', 'tt1')).toBe(true);
    });

    it('lists the titles that have a snapshot newest first', () => {
      vi.useFakeTimers();
      vi.setSystemTime(1000);
      store.add('favorites', 'tt1', movieMeta);
      vi.setSystemTime(2000);
      store.add('favorites', 'tt2');
      vi.setSystemTime(3000);
      store.add('favorites', 'tt3', seriesMeta);
      vi.useRealTimers();

      expect(store.titled('favorites')).toEqual([
        { id: 'tt3', addedAt: 3000, meta: seriesMeta },
        { id: 'tt1', addedAt: 1000, meta: movieMeta }
      ]);
      expect(store.titled('nope')).toEqual([]);
    });

    it('keeps adding at the head even when two titles share a millisecond', () => {
      vi.useFakeTimers();
      vi.setSystemTime(1000);
      store.add('favorites', 'tt1', movieMeta);
      store.add('favorites', 'tt2', seriesMeta);
      vi.useRealTimers();

      expect(store.titled('favorites').map((item) => item.id)).toEqual(['tt2', 'tt1']);
    });

    it('lists the non-empty lists that have a titled item', () => {
      store.add('watch-later', 'tt1');
      expect(store.withTitles).toEqual([]);

      store.add('watch-later', 'tt2', movieMeta);
      expect(store.withTitles.map((list) => list.id)).toEqual(['watch-later']);
    });

    it('persists lists and titles across loads', async () => {
      const created = store.create('Cinema');
      if (!created.ok) throw new Error('create failed');
      store.add(created.list.id, 'tt1', movieMeta);

      const fresh = await freshStore();

      expect(names(fresh)).toEqual(['Favoritos', 'Assistir depois', 'Cinema']);
      expect(fresh.has(created.list.id, 'tt1')).toBe(true);
    });

    it('keeps working in memory when storage is full', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      });

      expect(() => store.add('favorites', 'tt1', movieMeta)).not.toThrow();
      expect(store.has('favorites', 'tt1')).toBe(true);
    });
  });

  describe('snapshots', () => {
    it('reports the titles saved without a snapshot once', () => {
      store.add('favorites', 'tt1');
      store.add('watch-later', 'tt1');
      store.add('favorites', 'tt2', movieMeta);

      expect(store.untitled).toEqual([{ id: 'tt1' }]);
    });

    it('attaches looked-up snapshots to every list holding the title', async () => {
      store.add('favorites', 'tt1');
      store.add('watch-later', 'tt1');
      store.add('favorites', 'tt2', seriesMeta);
      store.add('favorites', 'tt3');

      store.attachMeta({ tt1: movieMeta, tt2: movieMeta, tt3: null });

      expect(store.get('favorites')?.items.map((item) => item.meta)).toEqual([
        movieMeta,
        seriesMeta,
        undefined
      ]);
      expect(store.get('watch-later')?.items[0].meta).toEqual(movieMeta);
      expect((await freshStore()).get('favorites')?.items[0].meta).toEqual(movieMeta);
    });
  });
});

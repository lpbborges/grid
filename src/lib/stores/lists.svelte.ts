import { readStoredJson, removeStored, writeStored } from './storage';
import { isRecord } from '$lib/utils/isRecord';
import { copyMeta, isProgressMeta } from '$lib/utils/progressMeta';
import type { ProgressMeta } from '$lib/types';

export const MAX_LIST_NAME_LENGTH = 40;

export type SystemListKind = 'favorites' | 'watch-later';

export interface ListItem {
  id: string;
  addedAt: number;
  meta?: ProgressMeta;
}

export type TitledListItem = Required<ListItem>;

export interface TitleList {
  id: string;
  name: string;
  system?: SystemListKind;
  /** When a title was last added or removed, or the list was created or renamed; 0 when unknown. */
  updatedAt: number;
  /** In the order they were added, oldest first. */
  items: ListItem[];
}

export type ListResult = { ok: true; list: TitleList } | { ok: false; error: string };

export interface RemovedList {
  list: TitleList;
  index: number;
}

const SYSTEM_LISTS: readonly { id: SystemListKind; name: string }[] = [
  { id: 'favorites', name: 'Favoritos' },
  { id: 'watch-later', name: 'Assistir depois' }
];

const LISTS_KEY = 'grid-lists';
const LEGACY_FAVORITES_KEY = 'grid-favorites';

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function parseMeta(value: unknown): { meta?: ProgressMeta } {
  return isProgressMeta(value) ? { meta: copyMeta(value) } : {};
}

const parseTime = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

function parseItems(value: unknown): ListItem[] {
  if (!Array.isArray(value)) return [];
  const items: ListItem[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== 'string') continue;
    if (typeof item.addedAt !== 'number' || !Number.isFinite(item.addedAt)) continue;
    const id = item.id;
    if (items.some((other) => other.id === id)) continue;
    items.push({ id, addedAt: item.addedAt, ...parseMeta(item.meta) });
  }
  return items;
}

function parseLists(stored: unknown): TitleList[] {
  const parsed = Array.isArray(stored) ? stored.filter(isRecord) : [];
  const lists: TitleList[] = SYSTEM_LISTS.map(({ id, name }) => {
    const saved = parsed.find((list) => list.system === id);
    return {
      id,
      name,
      system: id,
      updatedAt: parseTime(saved?.updatedAt),
      items: parseItems(saved?.items)
    };
  });
  for (const list of parsed) {
    if (list.system !== undefined || typeof list.id !== 'string') continue;
    if (typeof list.name !== 'string') continue;
    const id = list.id;
    const name = list.name.trim();
    const taken = lists.some((other) => other.id === id || sameName(other.name, name));
    if (!name || name.length > MAX_LIST_NAME_LENGTH || taken) continue;
    lists.push({ id, name, updatedAt: parseTime(list.updatedAt), items: parseItems(list.items) });
  }
  return lists;
}

function legacyId(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return isRecord(value) && typeof value.id === 'string' ? value.id : undefined;
}

// Older versions kept favorites in their own key, as plain ids or with a snapshot.
function parseLegacyFavorites(stored: unknown): ListItem[] {
  if (!Array.isArray(stored)) return [];
  const items: ListItem[] = [];
  for (const value of stored) {
    const id = legacyId(value);
    if (id === undefined || items.some((item) => item.id === id)) continue;
    items.push({
      id,
      addedAt: items.length,
      ...parseMeta(isRecord(value) ? value.meta : undefined)
    });
  }
  return items;
}

function newListId(): string {
  return `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

class ListsStore {
  lists = $state<TitleList[]>([]);

  constructor() {
    const stored = readStoredJson(LISTS_KEY);
    this.lists = parseLists(stored);
    const legacy = stored === undefined ? readStoredJson(LEGACY_FAVORITES_KEY) : undefined;
    if (legacy === undefined) return;
    this.lists[0].items = parseLegacyFavorites(legacy);
    this.persist();
    removeStored(LEGACY_FAVORITES_KEY);
  }

  private persist() {
    writeStored(LISTS_KEY, JSON.stringify(this.lists));
  }

  private update(listId: string, change: (list: TitleList) => TitleList) {
    this.lists = this.lists.map((list) =>
      list.id === listId ? { ...change(list), updatedAt: Date.now() } : list
    );
    this.persist();
  }

  private checkName(raw: string, exceptId?: string): { name: string } | { error: string } {
    const name = raw.trim();
    if (!name) return { error: 'Dê um nome à lista.' };
    if (name.length > MAX_LIST_NAME_LENGTH) {
      return { error: `Use até ${MAX_LIST_NAME_LENGTH} caracteres.` };
    }
    const taken = this.lists.some((list) => list.id !== exceptId && sameName(list.name, name));
    return taken ? { error: 'Já existe uma lista com esse nome.' } : { name };
  }

  get(listId: string): TitleList | undefined {
    return this.lists.find((list) => list.id === listId);
  }

  /** The lists, the one changed last first; lists changed together keep their stored order. */
  get recent(): TitleList[] {
    return [...this.lists].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Lists holding at least one title that can be drawn as a card, most recently changed first. */
  get withTitles(): TitleList[] {
    return this.recent.filter((list) => list.items.some((item) => item.meta));
  }

  /** Titles of a list that have a snapshot, newest first. */
  titled(listId: string): TitledListItem[] {
    return (this.get(listId)?.items ?? [])
      .filter((item): item is TitledListItem => item.meta !== undefined)
      .reverse();
  }

  /** Titles saved without a snapshot, once each however many lists hold them. */
  get untitled(): { id: string }[] {
    const ids = this.lists.flatMap((list) =>
      list.items.filter((item) => !item.meta).map((item) => item.id)
    );
    return ids.filter((id, index) => ids.indexOf(id) === index).map((id) => ({ id }));
  }

  has(listId: string, id: string | number): boolean {
    const key = String(id);
    return this.get(listId)?.items.some((item) => item.id === key) ?? false;
  }

  create(rawName: string): ListResult {
    const checked = this.checkName(rawName);
    if ('error' in checked) return { ok: false, error: checked.error };
    const list: TitleList = {
      id: newListId(),
      name: checked.name,
      updatedAt: Date.now(),
      items: []
    };
    this.lists = [...this.lists, list];
    this.persist();
    return { ok: true, list };
  }

  rename(listId: string, rawName: string): ListResult {
    const current = this.get(listId);
    if (!current || current.system)
      return { ok: false, error: 'Esta lista não pode ser renomeada.' };
    const checked = this.checkName(rawName, listId);
    if ('error' in checked) return { ok: false, error: checked.error };
    this.update(listId, (list) => ({ ...list, name: checked.name }));
    return { ok: true, list: this.get(listId) ?? current };
  }

  /** Deletes a list of the user's own; the result goes to {@link restore} to undo it. */
  remove(listId: string): RemovedList | null {
    const index = this.lists.findIndex((list) => list.id === listId);
    const list = this.lists[index];
    if (!list || list.system) return null;
    this.lists = this.lists.filter((other) => other.id !== listId);
    this.persist();
    return { list, index };
  }

  restore({ list, index }: RemovedList) {
    const taken = this.lists.some(
      (other) => other.id === list.id || sameName(other.name, list.name)
    );
    if (taken) return;
    const lists = [...this.lists];
    lists.splice(Math.min(index, lists.length), 0, list);
    this.lists = lists;
    this.persist();
  }

  add(listId: string, id: string | number, meta?: ProgressMeta) {
    const key = String(id);
    if (!this.get(listId) || this.has(listId, key)) return;
    const item: ListItem = { id: key, addedAt: Date.now(), ...(meta && { meta: copyMeta(meta) }) };
    this.update(listId, (list) => ({ ...list, items: [...list.items, item] }));
  }

  removeItem(listId: string, id: string | number) {
    const key = String(id);
    if (!this.has(listId, key)) return;
    this.update(listId, (list) => ({
      ...list,
      items: list.items.filter((item) => item.id !== key)
    }));
  }

  toggle(listId: string, id: string | number, meta?: ProgressMeta) {
    if (this.has(listId, id)) this.removeItem(listId, id);
    else this.add(listId, id, meta);
  }

  attachMeta(snapshots: Record<string, ProgressMeta | null>) {
    let changed = false;
    this.lists = this.lists.map((list) => ({
      ...list,
      items: list.items.map((item) => {
        const snapshot = snapshots[item.id];
        if (item.meta || !isProgressMeta(snapshot)) return item;
        changed = true;
        return { ...item, meta: copyMeta(snapshot) };
      })
    }));
    if (changed) this.persist();
  }
}

export const listsStore = new ListsStore();

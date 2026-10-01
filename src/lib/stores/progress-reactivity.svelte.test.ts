import { flushSync } from 'svelte';
import { expect, it, vi } from 'vitest';

vi.hoisted(() => {
  localStorage.setItem(
    'grid-progress',
    JSON.stringify({
      tt1: { time: 1, duration: 100, updatedAt: 2 },
      tt2: { time: 1, duration: 100, updatedAt: 1 }
    })
  );
});

const { progressStore } = await import('./progress.svelte');

it('updates entries watched by an effect when progress was loaded from localStorage', () => {
  let titles: (string | undefined)[] = [];
  const stop = $effect.root(() => {
    $effect(() => {
      titles = progressStore.entries.map((entry) => entry.meta?.title);
    });
  });
  flushSync();

  progressStore.attachMeta({ tt1: { type: 'movie', title: 'Movie', poster: 'm.jpg' } });
  flushSync();
  expect(titles).toEqual(['Movie']);

  progressStore.remove('tt1');
  flushSync();
  stop();

  expect(titles).toEqual([]);
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { progressStore } from '$lib/stores/progress.svelte';
import { UNDO_TOAST_DURATION_MS } from './UndoToast.svelte';
import RowHarness from './__fixtures__/ContinueWatchingRowHarness.svelte';

const meta = (title: string) => ({ type: 'series' as const, title, poster: 'p.jpg' });

function removeButtons() {
  return screen.getAllByRole('button', { name: 'Remover de Continuar assistindo' });
}

function cardLink(href: string) {
  return document.querySelector(`a[href="${href}"]`);
}

describe('ContinueWatchingRow removal', () => {
  beforeEach(() => {
    localStorage.clear();
    progressStore.progress = {
      'tt1-S1E2': { time: 10, duration: 100, updatedAt: 2, meta: meta('Alpha') },
      'tt1-S1E1': { time: 10, duration: 100, updatedAt: 1, meta: meta('Alpha') },
      'tt2-S1E1': { time: 10, duration: 100, updatedAt: 1, meta: meta('Beta') }
    };
  });
  afterEach(() => vi.useRealTimers());

  it('puts a separate remove button beside each card link', () => {
    render(RowHarness);

    const [button] = removeButtons();
    expect(button.closest('a')).toBeNull();
    expect(button.parentElement?.querySelector('a')).not.toBeNull();
  });

  it('removes every episode of the title and shows the undo toast', async () => {
    render(RowHarness);

    await fireEvent.click(removeButtons()[0]);

    expect(Object.keys(progressStore.progress)).toEqual(['tt2-S1E1']);
    expect(screen.getByRole('status').textContent).toContain('Removido');
    expect(screen.queryByText('Alpha')).toBeNull();
  });

  it('restores the title when the user undoes', async () => {
    render(RowHarness);

    await fireEvent.click(removeButtons()[0]);
    await fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));

    expect(Object.keys(progressStore.progress).sort()).toEqual([
      'tt1-S1E1',
      'tt1-S1E2',
      'tt2-S1E1'
    ]);
    expect(JSON.parse(localStorage.getItem('grid-progress')!)['tt1-S1E2'].time).toBe(10);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('undoes only the most recent removal', async () => {
    render(RowHarness);

    await fireEvent.click(removeButtons()[0]);
    await fireEvent.click(removeButtons()[0]);
    await fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));

    expect(Object.keys(progressStore.progress)).toEqual(['tt2-S1E1']);
  });

  it('keeps the undo toast after the last card is removed', async () => {
    progressStore.progress = {
      'tt2-S1E1': { time: 10, duration: 100, updatedAt: 1, meta: meta('Beta') }
    };
    render(RowHarness);

    await fireEvent.click(removeButtons()[0]);

    expect(screen.queryByText('Continuar assistindo')).toBeNull();
    expect(screen.getByRole('button', { name: 'Desfazer' })).toBeTruthy();
  });

  it('moves focus to Desfazer after removing', async () => {
    render(RowHarness);

    await fireEvent.click(removeButtons()[0]);

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Desfazer' }));
  });

  it('keeps the removal once the toast times out', async () => {
    vi.useFakeTimers();
    render(RowHarness);

    await fireEvent.click(removeButtons()[0]);
    await vi.advanceTimersByTimeAsync(UNDO_TOAST_DURATION_MS);

    expect(screen.queryByRole('status')).toBeNull();
    expect(Object.keys(progressStore.progress)).toEqual(['tt2-S1E1']);
  });
});

describe('ContinueWatchingRow focus after the toast', () => {
  beforeEach(() => {
    localStorage.clear();
    progressStore.progress = {
      'tt1-S1E1': { time: 10, duration: 100, updatedAt: 3, meta: meta('Alpha') },
      'tt2-S1E1': { time: 10, duration: 100, updatedAt: 2, meta: meta('Beta') },
      'tt3-S1E1': { time: 10, duration: 100, updatedAt: 1, meta: meta('Gamma') }
    };
  });
  afterEach(() => vi.useRealTimers());

  it('focuses the restored card after Desfazer', async () => {
    render(RowHarness);

    await fireEvent.click(removeButtons()[1]);
    await fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    await tick();

    expect(document.activeElement).toBe(cardLink('/series/tt2?s=1&e=1'));
  });

  it('focuses the card that took the removed one’s place after a timeout', async () => {
    vi.useFakeTimers();
    render(RowHarness);

    await fireEvent.click(removeButtons()[1]);
    await vi.advanceTimersByTimeAsync(UNDO_TOAST_DURATION_MS);
    await tick();

    expect(document.activeElement).toBe(cardLink('/series/tt3?s=1&e=1'));
  });

  it('focuses the previous card after Escape when the last card was removed', async () => {
    render(RowHarness);

    await fireEvent.click(removeButtons()[2]);
    await fireEvent.keyDown(screen.getByRole('button', { name: 'Desfazer' }), { key: 'Escape' });
    await tick();

    expect(screen.queryByRole('status')).toBeNull();
    expect(document.activeElement).toBe(cardLink('/series/tt2?s=1&e=1'));
  });

  it('leaves focus alone when it moved away before the timeout', async () => {
    vi.useFakeTimers();
    render(RowHarness);
    const elsewhere = cardLink('/series/tt1?s=1&e=1') as HTMLElement;

    await fireEvent.click(removeButtons()[1]);
    elsewhere.focus();
    await vi.advanceTimersByTimeAsync(UNDO_TOAST_DURATION_MS);
    await tick();

    expect(document.activeElement).toBe(elsewhere);
  });
});

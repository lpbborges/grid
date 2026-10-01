import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import UndoToast, { UNDO_TOAST_DURATION_MS } from './UndoToast.svelte';

function renderToast(overrides: Partial<{ onaction: () => void; ondismiss: () => void }> = {}) {
  return render(UndoToast, {
    message: 'Removido',
    actionLabel: 'Desfazer',
    onaction: vi.fn(),
    ondismiss: vi.fn(),
    ...overrides
  });
}

describe('UndoToast', () => {
  afterEach(() => vi.useRealTimers());

  it('announces the message and runs the action', async () => {
    const onaction = vi.fn();
    renderToast({ onaction });

    expect(screen.getByRole('status').textContent).toContain('Removido');
    await fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(onaction).toHaveBeenCalledTimes(1);
  });

  it('focuses the action, described by the message', () => {
    renderToast();

    const button = screen.getByRole('button', { name: 'Desfazer' });
    expect(document.activeElement).toBe(button);
    expect(document.getElementById(button.getAttribute('aria-describedby')!)?.textContent).toBe(
      'Removido'
    );
  });

  it('dismisses itself after the duration, reporting that it held focus', () => {
    vi.useFakeTimers();
    const ondismiss = vi.fn();
    renderToast({ ondismiss });

    vi.advanceTimersByTime(UNDO_TOAST_DURATION_MS - 1);
    expect(ondismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(ondismiss).toHaveBeenCalledTimes(1);
    expect(ondismiss).toHaveBeenCalledWith(true);
  });

  it('reports a timeout after focus moved elsewhere', () => {
    vi.useFakeTimers();
    const ondismiss = vi.fn();
    renderToast({ ondismiss });
    (document.activeElement as HTMLElement).blur();

    vi.advanceTimersByTime(UNDO_TOAST_DURATION_MS);

    expect(ondismiss).toHaveBeenCalledWith(false);
  });

  it('dismisses on Escape', async () => {
    const ondismiss = vi.fn();
    renderToast({ ondismiss });

    await fireEvent.keyDown(screen.getByRole('button', { name: 'Desfazer' }), { key: 'Escape' });

    expect(ondismiss).toHaveBeenCalledWith(true);
  });
});

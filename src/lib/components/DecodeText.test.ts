import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DecodeText from './DecodeText.svelte';

function allowMotion(allowed: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: !allowed }))
  );
}

describe('DecodeText', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows the final text at once under reduced motion', () => {
    allowMotion(false);
    render(DecodeText, { text: 'Preparando vídeo…' });

    expect(screen.getByText('Preparando vídeo…')).toBeInTheDocument();
    expect(screen.queryByTestId('decode-scramble')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shows the final text at once when matchMedia is missing', () => {
    vi.stubGlobal('matchMedia', undefined);
    render(DecodeText, { text: 'Carregando...' });

    expect(screen.getByText('Carregando...')).toBeInTheDocument();
    expect(screen.queryByTestId('decode-scramble')).toBeNull();
  });

  it('keeps the real string in the layout and hides the scramble from assistive tech', async () => {
    allowMotion(true);
    render(DecodeText, { text: 'Quase pronto…', durationMs: 600 });

    expect(screen.getByText('Quase pronto…')).toHaveClass('invisible');
    expect(screen.getByTestId('decode-scramble')).toHaveAttribute('aria-hidden', 'true');

    await vi.advanceTimersByTimeAsync(700);
    await tick();

    expect(screen.queryByTestId('decode-scramble')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(screen.getByText('Quase pronto…')).not.toHaveClass('invisible');
  });

  it('restarts cleanly when the text changes mid-decode', async () => {
    allowMotion(true);
    const { rerender } = render(DecodeText, { text: 'Primeiro passo', durationMs: 600 });
    vi.advanceTimersByTime(200);

    await rerender({ text: 'Segundo passo', durationMs: 600 });

    expect(vi.getTimerCount()).toBe(1);
    expect(screen.getByText('Segundo passo')).toBeInTheDocument();
    expect(screen.queryByText('Primeiro passo')).toBeNull();
  });

  it('clears its timer when unmounted mid-decode', () => {
    allowMotion(true);
    const { unmount } = render(DecodeText, { text: 'Quase pronto…' });
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('renders an empty string without animating', () => {
    allowMotion(true);
    render(DecodeText, { text: '' });

    expect(screen.queryByTestId('decode-scramble')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});

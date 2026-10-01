import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import NextEpisodeCard from './NextEpisodeCard.svelte';

describe('NextEpisodeCard', () => {
  it('names the next episode and counts down in pt-BR', () => {
    render(NextEpisodeCard, {
      props: { title: 'T1:E2 · Segundo', secondsLeft: 7, onplay: vi.fn(), oncancel: vi.fn() }
    });

    expect(screen.getByRole('group', { name: 'Próximo episódio em 7s' })).toBeInTheDocument();
    expect(screen.getByText('T1:E2 · Segundo')).toHaveAttribute('title', 'T1:E2 · Segundo');
    expect(screen.queryByText('Pausado')).not.toBeInTheDocument();
  });

  it('plays now and cancels through its two buttons', async () => {
    const onplay = vi.fn();
    const oncancel = vi.fn();
    render(NextEpisodeCard, { props: { title: 'T1:E2', secondsLeft: 10, onplay, oncancel } });

    await fireEvent.click(screen.getByRole('button', { name: 'Assistir agora' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onplay).toHaveBeenCalledTimes(1);
    expect(oncancel).toHaveBeenCalledTimes(1);
  });

  it('marks the countdown as paused while the video is paused', () => {
    render(NextEpisodeCard, {
      props: { title: 'T1:E2', secondsLeft: 6, paused: true, onplay: vi.fn(), oncancel: vi.fn() }
    });

    expect(screen.getByText('Pausado')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Próximo episódio em 6s' })).toBeInTheDocument();
  });

  it('empties its bar as the countdown runs', async () => {
    const props = { title: 'T1:E2', secondsLeft: 10, onplay: vi.fn(), oncancel: vi.fn() };
    const { rerender } = render(NextEpisodeCard, { props });
    const bar = screen.getByTestId('up-next-progress');
    expect(bar.style.transform).toBe('scaleX(1)');

    await rerender({ ...props, secondsLeft: 1 });
    expect(bar.style.transform).toBe('scaleX(0)');
  });
});

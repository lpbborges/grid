import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Skeleton from './Skeleton.svelte';

describe('Skeleton', () => {
  it('hides shapes from assistive tech and exposes one status label', () => {
    render(Skeleton, { variant: 'poster', count: 3, label: 'Carregando títulos' });
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando títulos');
    for (const shape of screen.getAllByTestId('skeleton-shape')) {
      expect(shape).toHaveAttribute('aria-hidden', 'true');
    }
    expect(screen.getAllByTestId('skeleton-shape')).toHaveLength(3);
  });

  it('renders no status when no label is given', () => {
    render(Skeleton, { variant: 'text' });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renders `lines` text bars', () => {
    render(Skeleton, { variant: 'text', lines: 4 });
    expect(screen.getAllByTestId('skeleton-line')).toHaveLength(4);
  });

  it('draws four corner brackets only when asked', () => {
    const { unmount } = render(Skeleton, { variant: 'poster', brackets: true });
    expect(screen.getAllByTestId('skeleton-bracket')).toHaveLength(4);
    unmount();
    render(Skeleton, { variant: 'poster', brackets: false });
    expect(screen.queryAllByTestId('skeleton-bracket')).toHaveLength(0);
  });

  it.each(['scan', 'pulse', 'none'] as const)('applies the %s effect', (effect) => {
    render(Skeleton, { effect });
    expect(screen.getAllByTestId('skeleton-shape')[0].dataset.effect).toBe(effect);
  });

  it('animates through shared classes only, with no inline animation', () => {
    const { container } = render(Skeleton, { variant: 'poster', count: 5 });
    expect(container.querySelectorAll('[style]')).toHaveLength(0);
  });

  it('wraps a row in one shape holding a heading bar and `count` posters', () => {
    render(Skeleton, { variant: 'row', count: 4 });
    expect(screen.getAllByTestId('skeleton-shape')).toHaveLength(1);
    expect(screen.getAllByTestId('skeleton-poster')).toHaveLength(4);
  });
});

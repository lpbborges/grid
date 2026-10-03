import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import HudProgress from './HudProgress.svelte';

const lit = () => screen.getAllByTestId('hud-segment').filter((s) => s.dataset.lit === 'true');

describe('HudProgress', () => {
  it('exposes progressbar semantics', () => {
    render(HudProgress, { value: 40, label: 'Progresso do carregamento' });
    const bar = screen.getByRole('progressbar', { name: 'Progresso do carregamento' });

    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('aria-valuenow', '40');
  });

  it('lights a share of the segments matching the value', () => {
    render(HudProgress, { value: 40, label: 'x' });

    expect(screen.getAllByTestId('hud-segment')).toHaveLength(20);
    expect(lit()).toHaveLength(8);
  });

  it('honours a custom segment count', () => {
    render(HudProgress, { value: 50, label: 'x', segments: 10 });

    expect(screen.getAllByTestId('hud-segment')).toHaveLength(10);
    expect(lit()).toHaveLength(5);
  });

  it('clamps out-of-range values', () => {
    const { rerender } = render(HudProgress, { value: 150, label: 'x' });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(lit()).toHaveLength(20);

    rerender({ value: -5, label: 'x' });
    expect(lit()).toHaveLength(0);
  });

  it('does not throw on a non-finite value', () => {
    expect(() => render(HudProgress, { value: NaN, label: 'x' })).not.toThrow();
    expect(lit()).toHaveLength(0);
  });
});

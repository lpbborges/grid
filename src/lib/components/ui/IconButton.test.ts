import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import IconButton from './IconButton.svelte';

describe('IconButton', () => {
  it('is named by its label, in the accessible name and the tooltip', () => {
    render(IconButton, { label: 'Fechar', icon: 'x' });
    const button = screen.getByRole('button', { name: 'Fechar' });

    expect(button).toHaveAttribute('title', 'Fechar');
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('is square, 40px by default and 32/44px on request', () => {
    const { unmount } = render(IconButton, { label: 'a', icon: 'x' });
    expect(screen.getByRole('button')).toHaveClass('h-10', 'w-10');
    unmount();

    render(IconButton, { label: 'a', icon: 'x', size: 'sm' });
    expect(screen.getByRole('button')).toHaveClass('h-8', 'w-8');
  });

  it('is ghost unless asked for a border', () => {
    const { unmount } = render(IconButton, { label: 'a', icon: 'x' });
    expect(screen.getByRole('button')).toHaveClass('border-transparent');
    unmount();

    render(IconButton, { label: 'a', icon: 'x', variant: 'neutral' });
    expect(screen.getByRole('button')).toHaveClass('border-line-strong');
  });

  it('forwards clicks and the pressed state', async () => {
    const onclick = vi.fn();
    render(IconButton, { label: 'Assistido', icon: 'check', pressed: true, onclick });
    const button = screen.getByRole('button', { name: 'Assistido', pressed: true });

    await fireEvent.click(button);

    expect(onclick).toHaveBeenCalledOnce();
  });
});

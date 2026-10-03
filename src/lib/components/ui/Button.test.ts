import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import Button from './Button.svelte';

const text = (value: string) => createRawSnippet(() => ({ render: () => `<span>${value}</span>` }));

describe('Button', () => {
  it('is type=button so it never submits a form by accident', () => {
    render(Button, { children: text('Ir') });

    expect(screen.getByRole('button', { name: 'Ir' })).toHaveAttribute('type', 'button');
  });

  it('calls onclick and forwards aria and data attributes', async () => {
    const onclick = vi.fn();
    render(Button, { onclick, 'aria-label': 'Fechar', 'data-testid': 'b', children: text('x') });

    await fireEvent.click(screen.getByTestId('b'));

    expect(onclick).toHaveBeenCalledOnce();
    expect(screen.getByTestId('b')).toHaveAttribute('aria-label', 'Fechar');
  });

  it('emits complete utility classes for each variant', () => {
    const expected = {
      primary: 'bg-green',
      accent: 'enabled:hover:bg-green',
      neutral: 'border-line-strong',
      warning: 'text-orange',
      danger: 'text-error',
      ghost: 'border-transparent'
    } as const;

    for (const [variant, token] of Object.entries(expected)) {
      const { unmount } = render(Button, {
        variant: variant as keyof typeof expected,
        children: text('x')
      });
      const className = screen.getByRole('button').className;
      expect(className, variant).toContain(token);
      expect(className, variant).not.toMatch(/undefined|\$\{|\[object/);
      unmount();
    }
  });

  it('sizes by height: 32, 40 and 44px', () => {
    const heights = { sm: 'h-8', md: 'h-10', lg: 'h-11' } as const;
    for (const [size, h] of Object.entries(heights)) {
      const { unmount } = render(Button, {
        size: size as keyof typeof heights,
        children: text('x')
      });
      expect(screen.getByRole('button')).toHaveClass(h);
      unmount();
    }
  });

  it('shows the shared green focus ring for every variant', () => {
    render(Button, { variant: 'danger', children: text('x') });

    expect(screen.getByRole('button')).toHaveClass(
      'focus-visible:ring-2',
      'focus-visible:ring-green'
    );
  });

  it('really disables, and the hover styles only apply to enabled buttons', () => {
    render(Button, { disabled: true, children: text('x') });
    const button = screen.getByRole('button');

    expect(button).toBeDisabled();
    expect(button.className).toContain('enabled:hover:');
  });

  it('is busy while loading, keeps its label and is disabled', () => () => {
    render(Button, { loading: true, children: text('Carregando...') });
    const button = screen.getByRole('button', { name: 'Carregando...' });

    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
  });

  it('exposes toggle state', () => {
    const { unmount } = render(Button, { pressed: true, children: text('x') });
    expect(screen.getByRole('button', { pressed: true })).toHaveClass('text-green');
    unmount();

    render(Button, { pressed: false, children: text('x') });
    expect(screen.getByRole('button', { pressed: false })).not.toHaveClass('bg-green/10');
  });

  it('does not set aria-pressed on ordinary buttons', () => {
    render(Button, { children: text('x') });

    expect(screen.getByRole('button')).not.toHaveAttribute('aria-pressed');
  });

  it('goes purple inside the player', () => {
    render(Button, { variant: 'ghost', surface: 'player', children: text('x') });

    expect(screen.getByRole('button').className).toContain('enabled:hover:text-primary');
  });

  it('adds the layout class without dropping the variant', () => {
    render(Button, { variant: 'primary', class: 'w-full', children: text('x') });

    expect(screen.getByRole('button')).toHaveClass('w-full', 'bg-green');
  });

  it('uses Orbitron capitals with display', () => {
    render(Button, { display: true, children: text('x') });

    expect(screen.getByRole('button')).toHaveClass('font-cyber', 'uppercase');
  });
});

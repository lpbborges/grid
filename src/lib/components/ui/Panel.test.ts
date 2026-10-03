import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { axe } from 'vitest-axe';
import Panel from './Panel.svelte';

const text = (value: string) => createRawSnippet(() => ({ render: () => `<span>${value}</span>` }));

describe('Panel', () => {
  it('is a bordered 4px surface with 16px padding', () => {
    render(Panel, { 'data-testid': 'p', children: text('x') });

    expect(screen.getByTestId('p')).toHaveClass(
      'rounded-sm',
      'border',
      'border-line-strong',
      'bg-surface',
      'p-4'
    );
  });

  it('renders the requested element and keeps its aria attributes', () => {
    render(Panel, { as: 'nav', 'aria-label': 'Principal', children: text('x') });

    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument();
  });

  it('has variants, padding steps and shadows', () => {
    render(Panel, {
      'data-testid': 'p',
      variant: 'accent',
      padding: 'xs',
      shadow: 'float',
      children: text('x')
    });

    expect(screen.getByTestId('p')).toHaveClass('border-l-green', 'p-1.5', 'shadow-float');
  });

  it('dashes and glasses on request', () => {
    render(Panel, {
      'data-testid': 'p',
      variant: 'subtle',
      dashed: true,
      glass: true,
      children: text('x')
    });

    expect(screen.getByTestId('p')).toHaveClass('border-dashed', 'backdrop-blur-md');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(Panel, {
      as: 'section',
      'aria-label': 'Resumo',
      children: text('x')
    });

    expect(await axe(container)).toHaveNoViolations();
  });
});

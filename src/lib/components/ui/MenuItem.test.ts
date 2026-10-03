import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import MenuItem from './MenuItem.svelte';

const text = (value: string) => createRawSnippet(() => ({ render: () => `<span>${value}</span>` }));

describe('MenuItem', () => {
  it('is a menuitem button that does not submit forms', () => {
    render(MenuItem, { children: text('Renomear') });

    const item = screen.getByRole('menuitem', { name: 'Renomear' });
    expect(item).toHaveAttribute('type', 'button');
    expect(item).not.toHaveAttribute('aria-checked');
  });

  it('exposes the choice of radio items through aria-checked', () => {
    render(MenuItem, { role: 'menuitemradio', selected: true, children: text('Ação') });

    expect(screen.getByRole('menuitemradio', { name: 'Ação' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('marks the current plain item with aria-current and a check that stays out of its name', () => {
    render(MenuItem, { selected: true, children: text('Português') });

    const item = screen.getByRole('menuitem', { name: 'Português' });
    expect(item).toHaveAttribute('aria-current', 'true');
    expect(item.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows a focus ring inside its own edge', () => {
    render(MenuItem, { children: text('x') });

    expect(screen.getByRole('menuitem')).toHaveClass(
      'focus-visible:ring-2',
      'focus-visible:ring-green',
      'focus-visible:ring-inset'
    );
  });

  it('is disabled and struck through when unavailable', () => {
    render(MenuItem, { disabled: true, children: text('Legenda') });

    const item = screen.getByRole('menuitem');
    expect(item).toBeDisabled();
    expect(item).toHaveClass('disabled:line-through');
  });

  it('sizes the text by step', () => {
    render(MenuItem, { size: 'lg', children: text('x') });

    expect(screen.getByRole('menuitem')).toHaveClass('text-base');
  });

  it('reddens on hover in the danger tone', () => {
    render(MenuItem, { tone: 'danger', children: text('Excluir') });

    expect(screen.getByRole('menuitem').className).toContain('hover:text-error');
  });
});

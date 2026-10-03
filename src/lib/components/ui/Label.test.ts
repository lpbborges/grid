import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import Label from './Label.svelte';

const text = (value: string) => createRawSnippet(() => ({ render: () => `<span>${value}</span>` }));

describe('Label', () => {
  it('is a span by default', () => {
    const { container } = render(Label, { children: text('Qualidade') });

    expect(container.querySelector('span > span')).toHaveTextContent('Qualidade');
  });

  it('names a control when it is a label', () => {
    render(Label, { as: 'label', for: 'q', children: text('Qualidade') });

    expect(screen.getByText('Qualidade').closest('label')).toHaveAttribute('for', 'q');
  });

  it('does not set `for` on non-label elements', () => {
    const { container } = render(Label, { as: 'h3', for: 'q', children: text('Faixas') });

    expect(container.querySelector('h3')).not.toHaveAttribute('for');
  });

  it('uses one 12px overline style with tone-specific colour', () => {
    const { container } = render(Label, { tone: 'green', children: text('Episódios') });
    const el = container.firstElementChild as HTMLElement;

    expect(el).toHaveClass('text-xs', 'font-bold', 'tracking-widest', 'uppercase', 'text-green');
    expect(el.className).not.toContain('text-[10px]');
  });

  it('switches to Orbitron with display', () => {
    const { container } = render(Label, { display: true, children: text('x') });

    expect(container.firstElementChild).toHaveClass('font-cyber');
  });
});

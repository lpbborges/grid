import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Icon from './Icon.svelte';

function svg(container: HTMLElement) {
  return container.querySelector('svg') as SVGSVGElement;
}

describe('Icon', () => {
  it('is decorative by default', () => {
    const { container } = render(Icon, { name: 'check' });

    expect(svg(container)).toHaveAttribute('aria-hidden', 'true');
    expect(svg(container)).not.toHaveAttribute('role');
  });

  it('draws a stroked 24px grid icon that inherits the text colour', () => {
    const { container } = render(Icon, { name: 'chevron-down' });
    const el = svg(container);

    expect(el).toHaveAttribute('viewBox', '0 0 24 24');
    expect(el).toHaveAttribute('stroke', 'currentColor');
    expect(el).toHaveAttribute('fill', 'none');
    expect(el).toHaveAttribute('stroke-width', '2');
    expect(el.querySelector('polyline')).not.toBeNull();
  });

  it('sizes by step', () => {
    const { container } = render(Icon, { name: 'plus', size: 'lg' });

    expect(svg(container)).toHaveAttribute('width', '24');
    expect(svg(container)).toHaveAttribute('height', '24');
  });

  it('draws bold strokes on request', () => {
    const { container } = render(Icon, { name: 'plus', weight: 'bold' });

    expect(svg(container)).toHaveAttribute('stroke-width', '2.5');
  });

  it('fills solid icons instead of stroking them', () => {
    const { container } = render(Icon, { name: 'dots-vertical' });
    const el = svg(container);

    expect(el).toHaveAttribute('fill', 'currentColor');
    expect(el).not.toHaveAttribute('stroke');
    expect(el.querySelectorAll('circle')).toHaveLength(3);
  });

  it('becomes an image with a name when labelled', () => {
    render(Icon, { name: 'search', label: 'Pesquisar' });

    expect(screen.getByRole('img', { name: 'Pesquisar' })).toBeInTheDocument();
  });

  it('passes the class through for layout', () => {
    const { container } = render(Icon, { name: 'x', class: 'shrink-0' });

    expect(svg(container)).toHaveClass('shrink-0');
  });
});

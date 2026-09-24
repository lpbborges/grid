import { render } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import GridLogo from './GridLogo.svelte';
import '@testing-library/jest-dom';

function urlRefs(svg: Element): string[] {
  const refs: string[] = [];
  for (const el of svg.querySelectorAll('[mask], [filter], [clip-path]')) {
    for (const attr of ['mask', 'filter', 'clip-path']) {
      const match = el.getAttribute(attr)?.match(/^url\(#(.+)\)$/);
      if (match) refs.push(match[1]);
    }
  }
  return refs;
}

describe('GridLogo component', () => {
  it('is exposed as an image named "Grid Logo" and forwards its class', () => {
    const { getByRole } = render(GridLogo, { props: { class: 'h-12 w-12' } });

    const logo = getByRole('img', { name: 'Grid Logo' });
    expect(logo).toHaveClass('h-12', 'w-12');
  });

  it('resolves every mask, filter and clip-path reference inside its own svg', () => {
    const { getByRole } = render(GridLogo);
    const svg = getByRole('img');

    const refs = urlRefs(svg);
    expect(refs.length).toBeGreaterThan(0);
    for (const id of refs) {
      expect(svg.querySelector(`[id="${id}"]`), `missing #${id}`).not.toBeNull();
    }
  });

  it('does not share ids between two logos on the same page', () => {
    const first = render(GridLogo).container;
    const second = render(GridLogo).container;

    const ids = (root: HTMLElement) => [...root.querySelectorAll('[id]')].map((el) => el.id);
    const firstIds = ids(first);
    expect(firstIds.length).toBeGreaterThan(0);
    expect(ids(second).filter((id) => firstIds.includes(id))).toEqual([]);
  });

  it('animates the scanlines and glitch slices on hover only when motion is allowed', () => {
    const { getByTestId, getAllByTestId } = render(GridLogo);

    expect(getByTestId('logo-scanlines')).toHaveClass('motion-safe:group-hover:animate-logo-scan');
    const glitches = getAllByTestId('logo-glitch');
    expect(glitches).toHaveLength(2);
    for (const slice of glitches) {
      // Hidden until the hover animation flashes it.
      expect(slice).toHaveClass('opacity-0', 'motion-safe:group-hover:animate-logo-glitch');
    }
  });
});

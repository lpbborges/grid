import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { axe } from 'vitest-axe';
import MediaBackdrop from './MediaBackdrop.svelte';

describe('MediaBackdrop', () => {
  it('has no accessibility violations', async () => {
    const { container } = render(MediaBackdrop, {
      props: {
        src: 'https://example.com/backdrop.jpg'
      }
    });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders image with given source', () => {
    const { container } = render(MediaBackdrop, {
      props: {
        src: 'https://example.com/backdrop.jpg'
      }
    });

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://example.com/backdrop.jpg');
    expect(img?.className).toContain('object-cover');
  });

  it('applies custom opacity class when provided', () => {
    const { container } = render(MediaBackdrop, {
      props: {
        src: 'https://example.com/backdrop.jpg',
        opacityClass: 'opacity-50'
      }
    });

    const img = container.querySelector('img');
    expect(img?.className).toContain('opacity-50');
  });
});

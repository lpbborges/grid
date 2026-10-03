import { describe, it, expect } from 'vitest';
import { ICONS, ICON_NAMES, ICON_SIZES } from './icons';

describe('icons', () => {
  it('draws every icon with at least one shape', () => {
    expect(ICON_NAMES.length).toBeGreaterThan(0);
    for (const name of ICON_NAMES) {
      expect(ICONS[name].shapes.length, name).toBeGreaterThan(0);
    }
  });

  it('only uses SVG shapes that Icon can render', () => {
    const tags = new Set(ICON_NAMES.flatMap((name) => ICONS[name].shapes.map((s) => s.tag)));
    for (const tag of tags)
      expect(['path', 'polyline', 'polygon', 'line', 'circle']).toContain(tag);
  });

  it('maps every size step to pixels', () => {
    expect(ICON_SIZES).toEqual({ xs: 14, sm: 16, md: 20, lg: 24, xl: 26 });
  });
});

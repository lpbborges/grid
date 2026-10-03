export type IconName =
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'x'
  | 'plus'
  | 'check'
  | 'search'
  | 'dots-vertical'
  | 'play'
  | 'settings';

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface IconShape {
  tag: 'path' | 'polyline' | 'polygon' | 'line' | 'circle';
  attrs: Record<string, string | number>;
}

export interface IconDef {
  /** Solid glyphs are filled with the text colour; the rest are 2px strokes. */
  solid?: boolean;
  shapes: IconShape[];
}

export const ICON_SIZES: Record<IconSize, number> = { xs: 14, sm: 16, md: 20, lg: 24, xl: 26 };

export const ICONS: Record<IconName, IconDef> = {
  'chevron-down': { shapes: [{ tag: 'polyline', attrs: { points: '6 9 12 15 18 9' } }] },
  'chevron-left': { shapes: [{ tag: 'polyline', attrs: { points: '15 18 9 12 15 6' } }] },
  'chevron-right': { shapes: [{ tag: 'polyline', attrs: { points: '9 18 15 12 9 6' } }] },
  x: {
    shapes: [
      { tag: 'line', attrs: { x1: 18, y1: 6, x2: 6, y2: 18 } },
      { tag: 'line', attrs: { x1: 6, y1: 6, x2: 18, y2: 18 } }
    ]
  },
  plus: { shapes: [{ tag: 'path', attrs: { d: 'M12 5v14M5 12h14' } }] },
  check: { shapes: [{ tag: 'polyline', attrs: { points: '20 6 9 17 4 12' } }] },
  search: {
    shapes: [
      { tag: 'circle', attrs: { cx: 11, cy: 11, r: 8 } },
      { tag: 'line', attrs: { x1: 21, y1: 21, x2: 16.65, y2: 16.65 } }
    ]
  },
  'dots-vertical': {
    solid: true,
    shapes: [
      { tag: 'circle', attrs: { cx: 12, cy: 5, r: 2 } },
      { tag: 'circle', attrs: { cx: 12, cy: 12, r: 2 } },
      { tag: 'circle', attrs: { cx: 12, cy: 19, r: 2 } }
    ]
  },
  play: { shapes: [{ tag: 'polygon', attrs: { points: '5 3 19 12 5 21 5 3' } }] },
  settings: {
    shapes: [
      {
        tag: 'path',
        attrs: {
          d: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z'
        }
      },
      { tag: 'circle', attrs: { cx: 12, cy: 12, r: 3 } }
    ]
  }
};

export const ICON_NAMES = Object.keys(ICONS) as IconName[];

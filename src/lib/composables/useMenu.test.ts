import { describe, it, expect, afterEach } from 'vitest';
import { useMenu } from './useMenu';

function build(count: number, role = 'menuitem') {
  const root = document.createElement('div');
  for (let i = 0; i < count; i++) {
    const button = document.createElement('button');
    button.setAttribute('role', role);
    button.textContent = String(i);
    root.append(button);
  }
  document.body.append(root);
  return { root, buttons: [...root.querySelectorAll('button')] };
}

const press = (key: string) => new KeyboardEvent('keydown', { key, cancelable: true });

describe('useMenu', () => {
  afterEach(() => (document.body.innerHTML = ''));

  describe('as a wrapping list', () => {
    it('moves with Up and Down and wraps at both ends', () => {
      const { root, buttons } = build(3);
      const menu = useMenu({ root: () => root });
      buttons[0].focus();

      menu.onkeydown(press('ArrowDown'));
      expect(buttons[1]).toHaveFocus();
      menu.onkeydown(press('ArrowDown'));
      menu.onkeydown(press('ArrowDown'));
      expect(buttons[0]).toHaveFocus();
      menu.onkeydown(press('ArrowUp'));
      expect(buttons[2]).toHaveFocus();
    });

    it('ignores Left and Right', () => {
      const { root, buttons } = build(3);
      const menu = useMenu({ root: () => root });
      buttons[0].focus();

      expect(menu.onkeydown(press('ArrowRight'))).toBe(false);
      expect(buttons[0]).toHaveFocus();
    });

    it('starts from the first item when focus is outside the items', () => {
      const { root, buttons } = build(3);
      const menu = useMenu({ root: () => root });

      menu.onkeydown(press('ArrowDown'));

      expect(buttons[0]).toHaveFocus();
    });
  });

  describe('as a clamping grid', () => {
    const grid = (count: number) => {
      const built = build(count, 'menuitemradio');
      return {
        ...built,
        menu: useMenu({ root: () => built.root, columns: () => 3, wrap: () => false })
      };
    };

    it('steps by one across and by the column count down', () => {
      const { buttons, menu } = grid(9);
      buttons[0].focus();

      menu.onkeydown(press('ArrowRight'));
      expect(buttons[1]).toHaveFocus();
      menu.onkeydown(press('ArrowDown'));
      expect(buttons[4]).toHaveFocus();
      menu.onkeydown(press('ArrowLeft'));
      menu.onkeydown(press('ArrowUp'));
      expect(buttons[0]).toHaveFocus();
    });

    it('stops at the edges instead of wrapping', () => {
      const { buttons, menu } = grid(5);
      buttons[0].focus();
      menu.onkeydown(press('ArrowLeft'));
      menu.onkeydown(press('ArrowUp'));
      expect(buttons[0]).toHaveFocus();

      buttons[4].focus();
      menu.onkeydown(press('ArrowRight'));
      menu.onkeydown(press('ArrowDown'));
      expect(buttons[4]).toHaveFocus();
    });
  });

  it('jumps to the first and last item with Home and End', () => {
    const { root, buttons } = build(4);
    const menu = useMenu({ root: () => root });
    buttons[1].focus();

    menu.onkeydown(press('End'));
    expect(buttons[3]).toHaveFocus();
    menu.onkeydown(press('Home'));
    expect(buttons[0]).toHaveFocus();
  });

  it('prevents the default only for the keys it handles', () => {
    const { root, buttons } = build(2);
    const menu = useMenu({ root: () => root });
    buttons[0].focus();
    const down = press('ArrowDown');
    const letter = press('a');

    expect(menu.onkeydown(down)).toBe(true);
    expect(down.defaultPrevented).toBe(true);
    expect(menu.onkeydown(letter)).toBe(false);
    expect(letter.defaultPrevented).toBe(false);
  });

  it('skips disabled items', () => {
    const { root, buttons } = build(3);
    buttons[1].disabled = true;
    const menu = useMenu({ root: () => root });
    buttons[0].focus();

    menu.onkeydown(press('ArrowDown'));

    expect(buttons[2]).toHaveFocus();
  });

  it('focuses the checked item, or the first when none is checked', () => {
    const { root, buttons } = build(3, 'menuitemradio');
    const menu = useMenu({ root: () => root });

    menu.focusSelected();
    expect(buttons[0]).toHaveFocus();

    buttons[2].setAttribute('aria-checked', 'true');
    menu.focusSelected();
    expect(buttons[2]).toHaveFocus();
  });

  it('does nothing without a root or items', () => {
    const menu = useMenu({ root: () => undefined });

    expect(menu.onkeydown(press('ArrowDown'))).toBe(false);
    expect(() => menu.focusFirst()).not.toThrow();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { axe } from 'vitest-axe';
import MenuHarness from './__fixtures__/MenuHarness.svelte';

const trigger = () => screen.getByRole('button', { name: 'Abrir' });
const items = () => [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')];
const key = (name: string) => fireEvent.keyDown(document.activeElement as Element, { key: name });

describe('Menu', () => {
  it('is closed until the trigger is pressed and wires the trigger to the panel', async () => {
    render(MenuHarness);

    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(trigger()).toHaveAttribute('aria-haspopup', 'menu');
    expect(screen.queryByRole('menu')).toBeNull();

    await fireEvent.click(trigger());

    const menu = screen.getByRole('menu', { name: 'Opções' });
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(trigger()).toHaveAttribute('aria-controls', menu.id);
  });

  it('focuses the first item on open', async () => {
    render(MenuHarness);

    await fireEvent.click(trigger());

    expect(items()[0]).toHaveFocus();
  });

  it('can focus the checked item instead, or nothing', async () => {
    const { unmount } = render(MenuHarness, { autofocus: 'selected', selectedIndex: 2 });
    await fireEvent.click(trigger());
    expect(items()[2]).toHaveFocus();
    unmount();

    render(MenuHarness, { autofocus: 'none' });
    await fireEvent.click(trigger());
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(items().some((item) => item === document.activeElement)).toBe(false);
  });

  it('stays open for the click that opened it and for clicks inside', async () => {
    render(MenuHarness);

    await fireEvent.click(trigger());
    await fireEvent.click(screen.getByRole('menu'));

    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('closes when the trigger is pressed again', async () => {
    render(MenuHarness);
    await fireEvent.click(trigger());

    await fireEvent.click(trigger());

    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    render(MenuHarness);
    await fireEvent.click(trigger());

    await key('Escape');

    expect(screen.queryByRole('menu')).toBeNull();
    await vi.waitFor(() => expect(trigger()).toHaveFocus());
  });

  it('does not take the focus back from an element that already has it', async () => {
    render(MenuHarness);
    const outside = screen.getByRole('button', { name: 'outside' });
    await fireEvent.click(trigger());
    window.addEventListener('keydown', () => outside.focus(), { once: true });

    await key('Escape');
    await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(outside).toHaveFocus();
  });

  it('closes on an outside click without stealing focus', async () => {
    render(MenuHarness);
    const outside = screen.getByRole('button', { name: 'outside' });
    await fireEvent.click(trigger());
    outside.focus();

    await fireEvent.click(outside);

    expect(screen.queryByRole('menu')).toBeNull();
    expect(outside).toHaveFocus();
  });

  it('closes on Tab and lets focus carry on from the trigger', async () => {
    render(MenuHarness);
    await fireEvent.click(trigger());

    await key('Tab');

    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger()).toHaveFocus();
  });

  it('closes through the close function handed to the items', async () => {
    const onpick = vi.fn();
    render(MenuHarness, { onpick });
    await fireEvent.click(trigger());

    await fireEvent.click(items()[1]);

    expect(onpick).toHaveBeenCalledWith(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('moves with the arrow keys, wrapping, and with Home and End', async () => {
    render(MenuHarness);
    await fireEvent.click(trigger());

    await key('ArrowUp');
    expect(items()[4]).toHaveFocus();
    await key('ArrowDown');
    expect(items()[0]).toHaveFocus();
    await key('End');
    expect(items()[4]).toHaveFocus();
    await key('Home');
    expect(items()[0]).toHaveFocus();
  });

  it('navigates a grid in three columns and clamps at the edges', async () => {
    render(MenuHarness, { layout: 'grid', autofocus: 'first' });
    await fireEvent.click(trigger());

    await key('ArrowDown');
    expect(items()[3]).toHaveFocus();
    await key('ArrowRight');
    expect(items()[4]).toHaveFocus();
    await key('ArrowDown');
    expect(items()[4]).toHaveFocus();
    await key('ArrowUp');
    expect(items()[1]).toHaveFocus();
    await key('ArrowUp');
    expect(items()[0]).toHaveFocus();
    await key('ArrowRight');
    await key('ArrowLeft');
    await key('ArrowLeft');
    expect(items()[0]).toHaveFocus();
  });

  it('keeps Escape from reaching window listeners when asked', async () => {
    const onWindowKey = vi.fn();
    window.addEventListener('keydown', onWindowKey);
    render(MenuHarness, { stopEscape: true });
    await fireEvent.click(trigger());

    await key('Escape');

    expect(onWindowKey).not.toHaveBeenCalled();
    window.removeEventListener('keydown', onWindowKey);
  });

  it('is a group popover that neither moves focus nor closes on Tab or arrow keys', async () => {
    render(MenuHarness, { role: 'group' });
    expect(trigger()).toHaveAttribute('aria-haspopup', 'true');

    await fireEvent.click(trigger());
    const group = screen.getByRole('group', { name: 'Opções' });

    expect(group.contains(document.activeElement)).toBe(false);
    await fireEvent.keyDown(group, { key: 'Tab' });
    await fireEvent.keyDown(group, { key: 'ArrowDown' });
    expect(group).toBeInTheDocument();
  });

  it('places the panel from the placement map', async () => {
    render(MenuHarness, { placement: 'top-end' });
    await fireEvent.click(trigger());

    expect(screen.getByRole('menu')).toHaveClass('bottom-full', 'right-0', 'mb-2');
  });

  it('floats above the page as a dropdown with the shared surface', async () => {
    render(MenuHarness);
    await fireEvent.click(trigger());

    expect(screen.getByRole('menu')).toHaveClass(
      'z-dropdown',
      'shadow-float',
      'border-line-strong',
      'bg-surface'
    );
  });

  it('marks the selected item with a check, aria-checked and not colour alone', async () => {
    render(MenuHarness, { layout: 'grid', selectedIndex: 1 });
    await fireEvent.click(trigger());

    expect(items()[1]).toHaveAttribute('aria-checked', 'true');
    expect(items()[1].querySelector('svg')).not.toBeNull();
    expect(items()[0]).toHaveAttribute('aria-checked', 'false');
    expect(items()[0].querySelector('svg')).toBeNull();
  });

  it('has no accessibility violations when open', async () => {
    const { container } = render(MenuHarness);
    await fireEvent.click(trigger());

    expect(await axe(container)).toHaveNoViolations();
  });
});

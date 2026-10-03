export const MENU_ITEM_SELECTOR =
  '[role="menuitem"]:not(:disabled), [role="menuitemradio"]:not(:disabled), [role="menuitemcheckbox"]:not(:disabled)';

export interface MenuNavOptions {
  root: () => HTMLElement | undefined;
  /** 1 for a list (Up/Down), more for a grid (Left/Right step 1, Up/Down step `columns`). */
  columns?: () => number;
  /** Wrap past the ends (lists) or stop at them (grids). */
  wrap?: () => boolean;
}

/**
 * Roving focus for the items of an open menu. `onkeydown` handles the arrow keys, Home and End
 * and returns whether it handled the key, so the caller can add its own keys (Escape, Tab).
 */
export function useMenu(options: MenuNavOptions) {
  function items(): HTMLElement[] {
    return [...(options.root()?.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR) ?? [])];
  }

  function focusFirst(): void {
    items()[0]?.focus();
  }

  /** Focuses the checked (or current) item, or the first one when none is. */
  function focusSelected(): void {
    const all = items();
    const selected = all.find(
      (item) =>
        item.getAttribute('aria-checked') === 'true' || item.getAttribute('aria-current') === 'true'
    );
    (selected ?? all[0])?.focus();
  }

  function onkeydown(e: KeyboardEvent): boolean {
    const columns = options.columns?.() ?? 1;
    const steps: Record<string, number> =
      columns > 1
        ? { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }
        : { ArrowDown: 1, ArrowUp: -1 };

    const all = items();
    if (!all.length) return false;
    const current = all.indexOf(document.activeElement as HTMLElement);

    let next: number;
    if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = all.length - 1;
    else if (e.key in steps) {
      const target = current + steps[e.key];
      next =
        (options.wrap?.() ?? true)
          ? (target + all.length) % all.length
          : Math.min(all.length - 1, Math.max(0, target));
    } else return false;

    e.preventDefault();
    all[next]?.focus();
    return true;
  }

  return { items, focusFirst, focusSelected, onkeydown };
}

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * While `active()` is true: moves focus into `root` (to `[data-autofocus]` when present, else the
 * first focusable element), keeps Tab and Shift+Tab inside it, and puts focus back on whatever
 * had it before once it turns false or the component goes away.
 */
export function useFocusTrap(options: {
  active: () => boolean;
  root: () => HTMLElement | undefined;
}) {
  $effect(() => {
    const root = options.root();
    if (!options.active() || !root) return;

    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = () => [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
    (root.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0] ?? root).focus();

    const onKeydown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const all = focusables();
      if (!all.length) {
        e.preventDefault();
        return;
      }
      const first = all[0];
      const last = all[all.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && (current === first || !root.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || !root.contains(current))) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeydown);
    return () => {
      document.removeEventListener('keydown', onKeydown);
      if (previous?.isConnected) previous.focus();
    };
  });
}

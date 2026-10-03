export type DismissReason = 'escape' | 'outside';

/**
 * Calls `onclose` on Escape and on a click outside `root` (trigger and panel together), but only
 * while `open()` is true: the window listeners exist only for as long as the surface is open.
 *
 * It never moves focus. The caller decides: Escape usually returns it to the trigger, an outside
 * click must not steal it.
 *
 * "Outside" is judged by the event's composed path, which was fixed when the click was
 * dispatched, so a target that the click itself removes from the DOM still counts as inside.
 * The click that opens the surface is inside by construction (the trigger is within `root`).
 */
export function useDismissable(options: {
  open: () => boolean;
  root: () => HTMLElement | undefined;
  onclose: (reason: DismissReason) => void;
}): void {
  $effect(() => {
    if (!options.open()) return;

    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') options.onclose('escape');
    };
    const onClick = (e: MouseEvent) => {
      const root = options.root();
      if (root && !e.composedPath().includes(root)) options.onclose('outside');
    };

    window.addEventListener('keydown', onKeydown);
    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('keydown', onKeydown);
      window.removeEventListener('click', onClick);
    };
  });
}

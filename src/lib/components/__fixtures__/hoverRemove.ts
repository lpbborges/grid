import { fireEvent, screen } from '@testing-library/svelte';
import { vi } from 'vitest';
import { HOVER_DELAY_MS } from '$lib/stores/hoverPreview.svelte';

/** Removes a title from Continuar assistindo the way a user does: through its hover card. Needs fake timers and a rendered `HoverPreview`. */
export async function removeViaHover(card: Element): Promise<void> {
  await fireEvent.mouseEnter(card);
  await vi.advanceTimersByTimeAsync(HOVER_DELAY_MS);
  await fireEvent.click(screen.getByRole('button', { name: 'Remover de Continuar assistindo' }));
}

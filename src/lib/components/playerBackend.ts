import { playbackMode } from '$lib/engine/platform';
import { useDomBackend } from '$lib/composables/useDomBackend.svelte';
import { useMpvBackend } from '$lib/composables/useMpvBackend.svelte';
import type { PlayerBackend } from '$lib/types';

export function createPlayerBackend(getVideoElement: () => HTMLVideoElement | null): PlayerBackend {
  return playbackMode() === 'native' ? useMpvBackend() : useDomBackend(getVideoElement);
}

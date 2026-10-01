import type { LayoutLoad } from './$types';
import { backfillProgressSnapshots } from '$lib/engine/progressSnapshots';

export const ssr = false;

// Not awaited: the Continuar assistindo row fills in as titles arrive.
export const load: LayoutLoad = ({ fetch }) => {
  backfillProgressSnapshots(fetch);
  return {};
};

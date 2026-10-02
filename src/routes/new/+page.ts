import type { PageLoad } from './$types';
import { newAndPopularRows } from '$lib/utils/catalogRows';

export const load: PageLoad = () => ({ rows: newAndPopularRows() });

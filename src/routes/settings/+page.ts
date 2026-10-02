import type { PageLoad } from './$types';
import { getCacheUsageBytes } from '$lib/engine/cache';
import { logger } from '$lib/logger';

export const load: PageLoad = async () => {
  const cacheUsageBytes = await getCacheUsageBytes().catch((error: unknown) => {
    logger.warn('Failed to read the cache usage', error);
    return null;
  });
  return { cacheUsageBytes };
};

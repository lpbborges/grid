import { logger } from '$lib/logger';

/** The values of the fulfilled results, logging each rejection with `message`. */
export function fulfilledValues<T>(results: PromiseSettledResult<T>[], message: string): T[] {
  const values: T[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') values.push(result.value);
    else logger.warn(message, result.reason);
  }
  return values;
}

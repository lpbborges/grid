import { browser } from '$app/environment';
import { logger } from '$lib/logger';

/** The parsed value stored under `key`, or `undefined` when missing or corrupt. */
export function readStoredJson(key: string): unknown {
  if (!browser) return undefined;
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? undefined : JSON.parse(stored);
  } catch (error) {
    logger.warn(`Ignoring unreadable stored value for ${key}`, error);
    return undefined;
  }
}

/** Keeps the app working in memory when storage is full or unavailable. */
export function writeStored(key: string, value: string): void {
  if (!browser) return;
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    logger.warn(`Failed to persist ${key}`, error);
  }
}

export function readStoredIds(key: string): string[] {
  const parsed = readStoredJson(key);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((id): id is string | number => typeof id === 'string' || typeof id === 'number')
    .map(String);
}

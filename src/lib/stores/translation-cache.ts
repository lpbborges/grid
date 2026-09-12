const DB_NAME = 'grid-play-translations';
const DB_VERSION = 1;
const STORE_NAME = 'entries';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface CacheEntry {
  key: string;
  value: string;
  createdAt: number;
}

function cacheKey(text: string, targetLang: string): string {
  return `${text}|${targetLang}`;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

export async function getCached(text: string, targetLang: string): Promise<string | undefined> {
  const key = cacheKey(text, targetLang);
  try {
    const db = await openDb();
    const entry = await new Promise<CacheEntry | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result as CacheEntry | undefined);
      request.onerror = () => reject(request.error);
    });

    if (!entry) return undefined;

    if (Date.now() - entry.createdAt > TTL_MS) {
      // Stale entry: delete it and treat as a miss.
      try {
        const db2 = await openDb();
        await new Promise<void>((resolve, reject) => {
          const tx = db2.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const request = store.delete(key);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      } catch (e) {
        console.warn('translation-cache: failed to delete stale entry', e);
      }
      return undefined;
    }

    return entry.value;
  } catch (e) {
    console.warn('translation-cache: read failed, falling through to network', e);
    return undefined;
  }
}

export async function setCached(text: string, targetLang: string, value: string): Promise<void> {
  const key = cacheKey(text, targetLang);
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const entry: CacheEntry = { key, value, createdAt: Date.now() };
      const request = store.put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.warn('translation-cache: write failed', e);
  }
}

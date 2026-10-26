import type { ApiResponse } from '../types';

const DB_NAME = 'mis-wla';
const STORE = 'lst5yrs';
const CLIENT_TTL_MS = 24 * 60 * 60 * 1000;

type CachedEntry = {
  at: number;
  payload: ApiResponse;
};

function cacheKey(employee: string) {
  return employee || '__all__';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function readWlaCache(employee: string): Promise<ApiResponse | null> {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(cacheKey(employee));
      req.onsuccess = () => {
        const entry = req.result as CachedEntry | undefined;
        if (!entry || Date.now() - entry.at > CLIENT_TTL_MS) {
          resolve(null);
          return;
        }
        resolve(entry.payload);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function writeWlaCache(employee: string, payload: ApiResponse): Promise<void> {
  try {
    const db = await openDb();
    const entry: CachedEntry = { at: Date.now(), payload };
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(entry, cacheKey(employee));
  } catch {
    // Quota or private mode — ignore
  }
}

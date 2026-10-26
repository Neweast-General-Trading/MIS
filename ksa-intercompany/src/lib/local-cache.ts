import type { ApiResponse } from '../types';

const CACHE_KEY = 'mis-ic-ksa-v2';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function readLocalIcCache(): ApiResponse | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt: number; data: ApiResponse };
    if (!parsed?.data?.rows || !Array.isArray(parsed.data.rows)) return null;
    if (Date.now() - parsed.savedAt > CACHE_MAX_AGE_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeLocalIcCache(data: ApiResponse) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // ignore quota / private mode
  }
}

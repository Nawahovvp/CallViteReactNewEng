/**
 * Cache-first data loading service for Instant Load.
 * Caches: poData, prData, engData, plantStockData
 */

const CACHE_PREFIX = 'app_cache_';
const DEFAULT_MAX_AGE = 30 * 60 * 1000; // 30 minutes

export const CACHEABLE_KEYS = ['poData', 'prData', 'engData', 'plantStockData'];

/**
 * Save data to localStorage with a timestamp.
 */
export function saveToCache(key, data) {
    try {
        const entry = {
            timestamp: Date.now(),
            data: data
        };
        localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
        console.log(`[Cache] Saved ${key} (${Array.isArray(data) ? data.length + ' items' : 'object'})`);
    } catch (e) {
        console.warn(`[Cache] Failed to save ${key}:`, e);
        // If localStorage is full, try clearing old caches
        try {
            CACHEABLE_KEYS.forEach(k => localStorage.removeItem(CACHE_PREFIX + k));
            localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ timestamp: Date.now(), data }));
        } catch (e2) {
            // Give up silently
        }
    }
}

/**
 * Load data from localStorage cache.
 * Returns the data or null if not found / expired.
 */
export function loadFromCache(key, maxAgeMs = DEFAULT_MAX_AGE) {
    try {
        const raw = localStorage.getItem(CACHE_PREFIX + key);
        if (!raw) return null;
        const entry = JSON.parse(raw);
        if (!entry || !entry.data) return null;

        // Check freshness
        const age = Date.now() - (entry.timestamp || 0);
        if (age > maxAgeMs) {
            console.log(`[Cache] ${key} expired (${Math.round(age / 1000)}s old)`);
            return null;
        }

        console.log(`[Cache] Loaded ${key} from cache (${Math.round(age / 1000)}s old)`);
        return entry.data;
    } catch (e) {
        console.warn(`[Cache] Failed to load ${key}:`, e);
        return null;
    }
}

/**
 * Load all cacheable data sources at once.
 * Returns an object with keys from CACHEABLE_KEYS, each containing cached data or null.
 */
export function loadAllFromCache() {
    const result = {};
    CACHEABLE_KEYS.forEach(key => {
        result[key] = loadFromCache(key);
    });
    return result;
}

/**
 * Save all cacheable data sources at once.
 */
export function saveAllToCache(data) {
    CACHEABLE_KEYS.forEach(key => {
        if (data[key] !== undefined && data[key] !== null) {
            saveToCache(key, data[key]);
        }
    });
}

/**
 * Cache-first data loading service using IndexedDB (handles large datasets).
 * Caches: poData, prData, engData, plantStockData
 */

const DB_NAME = 'AppDataCache';
const DB_VERSION = 1;
const STORE_NAME = 'dataCache';
const DEFAULT_MAX_AGE = 30 * 60 * 1000; // 30 minutes

export const CACHEABLE_KEYS = ['poData', 'prData', 'engData', 'plantStockData'];

// --- IndexedDB helpers ---

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'key' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function idbGet(db, key) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

function idbPut(db, key, data) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put({ key, timestamp: Date.now(), data });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

// --- Public API ---

/**
 * Save data to IndexedDB cache with a timestamp.
 */
export async function saveToCache(key, data) {
    try {
        const db = await openDB();
        await idbPut(db, key, data);
        console.log(`[Cache] Saved ${key} (${Array.isArray(data) ? data.length + ' items' : 'object'})`);
    } catch (e) {
        console.warn(`[Cache] Failed to save ${key}:`, e);
    }
}

/**
 * Load data from IndexedDB cache.
 * Returns the data or null if not found / expired.
 */
export async function loadFromCache(key, maxAgeMs = DEFAULT_MAX_AGE) {
    try {
        const db = await openDB();
        const entry = await idbGet(db, key);
        if (!entry || !entry.data) return null;

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
 */
export async function loadAllFromCache() {
    const result = {};
    for (const key of CACHEABLE_KEYS) {
        result[key] = await loadFromCache(key);
    }
    return result;
}

/**
 * Save all cacheable data sources at once.
 */
export async function saveAllToCache(data) {
    for (const key of CACHEABLE_KEYS) {
        if (data[key] !== undefined && data[key] !== null) {
            await saveToCache(key, data[key]);
        }
    }
}

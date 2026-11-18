/** Minimal slice of chrome.storage.local that the popup needs. */
export interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export const EXTENSION_STORAGE_KEY = 'phonefix-extension-data';

/**
 * Presents chrome.storage.local as a synchronous Storage so the shared settings
 * and saved-repairs modules work unchanged. Everything lives under one key;
 * reads come from memory and every change is written through.
 */
export async function createExtensionStorage(area: StorageArea, storageKey = EXTENSION_STORAGE_KEY): Promise<Storage> {
  const data = new Map<string, string>();
  try {
    const stored = (await area.get(storageKey))[storageKey];
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      for (const [key, value] of Object.entries(stored)) if (typeof value === 'string') data.set(key, value);
    }
  } catch { /* Start empty if storage cannot be read. */ }

  let pending: Promise<void> = Promise.resolve();
  function persist(): void {
    const snapshot = Object.fromEntries(data);
    pending = pending.then(() => area.set({ [storageKey]: snapshot })).catch(() => undefined);
  }

  const storage: Storage = {
    get length() { return data.size; },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(String(key)) ?? null,
    setItem(key, value) { data.set(String(key), String(value)); persist(); },
    removeItem(key) { if (data.delete(String(key))) persist(); },
    clear() { data.clear(); persist(); },
  };
  return storage;
}

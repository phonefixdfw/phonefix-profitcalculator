import { describe, expect, it } from 'vitest';
import { createExtensionStorage, EXTENSION_STORAGE_KEY, type StorageArea } from './extension-storage';

function fakeArea(initial: Record<string, unknown> = {}): StorageArea & { data: Record<string, unknown> } {
  const data = { ...initial };
  return { data, get: async (key) => ({ [key]: data[key] }), set: async (items) => { Object.assign(data, structuredClone(items)); } };
}
const flush = () => new Promise((resolve) => setTimeout(resolve));

describe('extension storage adapter', () => {
  it('loads existing values and ignores malformed ones', async () => {
    const storage = await createExtensionStorage(fakeArea({ [EXTENSION_STORAGE_KEY]: { a: '1', b: 2 } }));
    expect(storage.getItem('a')).toBe('1');
    expect(storage.getItem('b')).toBeNull();
    expect(storage.length).toBe(1);
  });

  it('starts empty for missing or non-object data', async () => {
    expect((await createExtensionStorage(fakeArea())).length).toBe(0);
    expect((await createExtensionStorage(fakeArea({ [EXTENSION_STORAGE_KEY]: 'x' }))).length).toBe(0);
  });

  it('starts empty when storage throws', async () => {
    const area: StorageArea = { get: async () => { throw new Error('nope'); }, set: async () => undefined };
    expect((await createExtensionStorage(area)).getItem('a')).toBeNull();
  });

  it('writes changes through under its own single key', async () => {
    const area = fakeArea({ other: 'untouched' });
    const storage = await createExtensionStorage(area);
    storage.setItem('phonefix-settings', '{"x":1}');
    storage.setItem('y', '2');
    storage.removeItem('y');
    await flush();
    expect(area.data[EXTENSION_STORAGE_KEY]).toEqual({ 'phonefix-settings': '{"x":1}' });
    expect(area.data.other).toBe('untouched');
    storage.clear();
    await flush();
    expect(area.data[EXTENSION_STORAGE_KEY]).toEqual({});
  });

  it('survives write failures', async () => {
    const area: StorageArea = { get: async () => ({}), set: async () => { throw new Error('quota'); } };
    const storage = await createExtensionStorage(area);
    storage.setItem('a', '1');
    await flush();
    expect(storage.getItem('a')).toBe('1');
  });
});

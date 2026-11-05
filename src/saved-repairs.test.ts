import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_MONEY_CENTS } from './money';
import { loadSavedRepairs, SAVED_REPAIRS_KEY, SAVED_REPAIRS_VERSION, saveSavedRepairs, validateRepair, type SavedRepair } from './saved-repairs';

afterEach(() => vi.unstubAllGlobals());

const repair: SavedRepair = { id: 'screen-13', name: 'iPhone 13 screen', partCost: 4529, price: 12999, screenRepair: true, laborHundredths: 4525 };

function storage(raw: string | null = null) {
  const data = new Map<string, string>();
  if (raw !== null) data.set(SAVED_REPAIRS_KEY, raw);
  const store = { getItem: vi.fn((key: string) => data.get(key) ?? null), setItem: vi.fn((key: string, value: string) => data.set(key, value)) };
  vi.stubGlobal('localStorage', store);
  return store;
}

describe('saved repair storage', () => {
  it('round-trips exact cents, optional labor, and an empty list under a separate versioned key', () => {
    const store = storage();
    const second = { id: 'battery', name: 'Battery', partCost: 0, price: 0, screenRepair: false };
    expect(saveSavedRepairs([repair, second])).toBe(true);
    expect(store.setItem).toHaveBeenCalledWith(SAVED_REPAIRS_KEY, JSON.stringify({ version: SAVED_REPAIRS_VERSION, repairs: [repair, second] }));
    expect(loadSavedRepairs()).toEqual([repair, second]);
    expect(saveSavedRepairs([])).toBe(true);
    expect(loadSavedRepairs()).toEqual([]);
  });

  it.each([null, '{broken', 'null', '[]', '{}', '{"version":1}', '{"version":1,"repairs":{}}'])('falls back to empty for missing or corrupt data: %s', (raw) => {
    storage(raw);
    expect(loadSavedRepairs()).toEqual([]);
  });

  it.each([undefined, 0, 2, '1'])('rejects missing, older, newer and nonnumeric versions: %s', (version) => {
    const raw = JSON.stringify({ version, repairs: [repair] });
    const store = storage(raw);
    expect(loadSavedRepairs()).toEqual([]);
    expect(store.setItem).not.toHaveBeenCalled();
    expect(store.getItem(SAVED_REPAIRS_KEY)).toBe(raw);
  });

  it.each([
    { id: '' }, { name: ' ' }, { name: 'x'.repeat(121) }, { partCost: -1 }, { price: 1.5 },
    { price: MAX_MONEY_CENTS + 1 }, { screenRepair: 'yes' }, { laborHundredths: -1 }, { laborHundredths: null },
    { laborHundredths: MAX_MONEY_CENTS + 1 }, { partCost: '12' },
  ])('rejects invalid records without partially loading a corrupt list: %j', (changes) => {
    storage(JSON.stringify({ version: 1, repairs: [repair, { ...repair, id: 'second', ...changes }] }));
    expect(loadSavedRepairs()).toEqual([]);
  });

  it('rejects duplicate ids and invalid writes', () => {
    const store = storage(JSON.stringify({ version: 1, repairs: [repair, repair] }));
    expect(loadSavedRepairs()).toEqual([]);
    expect(saveSavedRepairs([repair, repair])).toBe(false);
    expect(store.setItem).not.toHaveBeenCalled();
  });

  it('handles unavailable storage and failed writes', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Denied'); }, setItem: () => { throw new Error('Quota'); } });
    expect(loadSavedRepairs()).toEqual([]);
    expect(saveSavedRepairs([repair])).toBe(false);
  });
});

describe('saved repair form validation', () => {
  const draft = { name: '  iPhone 13 screen  ', partCost: '45.29', price: '129.99', screenRepair: true, laborMinutes: '45.25' };
  it('trims names and parses money and time without losing hundredths', () => {
    const { id: _id, ...expected } = repair;
    expect(validateRepair(draft)).toEqual({ errors: {}, repair: expected });
    expect(validateRepair({ ...draft, laborMinutes: '' }).repair).not.toHaveProperty('laborHundredths');
    expect(validateRepair({ ...draft, laborMinutes: '0' }).repair?.laborHundredths).toBe(0);
  });
  it.each([
    ['name', ''], ['name', 'x'.repeat(121)], ['partCost', '-1'], ['partCost', '1000000'],
    ['price', ''], ['price', '1.234'], ['laborMinutes', '-2'], ['laborMinutes', '1e10'],
  ])('rejects invalid %s: %s', (key, value) => {
    const result = validateRepair({ ...draft, [key]: value });
    expect(result.repair).toBeUndefined();
    expect(result.errors[key]).toBeTruthy();
  });
});

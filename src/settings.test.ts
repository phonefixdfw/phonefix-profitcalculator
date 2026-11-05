import { describe, expect, it, vi, afterEach } from 'vitest';
import { DEFAULT_CONFIG } from './config';
import { draftFromConfig, loadSettings, SETTINGS_KEY, validateSettings } from './settings';

afterEach(() => vi.unstubAllGlobals());

describe('settings validation', () => {
  it('accepts the default tiers and custom values', () => {
    const draft = draftFromConfig(DEFAULT_CONFIG);
    draft.salesTax = '10'; draft.cardFee = '3.25'; draft.cardFixedFee = '0.30'; draft.defaultTargetProfit = '95'; draft.tiers[0].cost = '20';
    const config = validateSettings(draft).config!;
    expect(config).toMatchObject({ salesTaxBps: 1000, cardFeeBps: 325, cardFixedFee: 30, defaultTargetProfit: 9500 });
    expect(config.warrantyTiers[0]).toEqual({ min: 0, max: 9999, cost: 2000 });
  });
  it.each([
    ['negative target', (d: ReturnType<typeof draftFromConfig>) => { d.defaultTargetProfit = '-1'; }, '$0.00 or more'],
    ['blank target', (d: ReturnType<typeof draftFromConfig>) => { d.defaultTargetProfit = ''; }, 'Enter an amount'],
    ['huge target', (d: ReturnType<typeof draftFromConfig>) => { d.defaultTargetProfit = '1000000'; }, 'up to'],
    ['gap', (d: ReturnType<typeof draftFromConfig>) => { d.tiers[1].min = '100.01'; }, 'gap'],
    ['overlap', (d: ReturnType<typeof draftFromConfig>) => { d.tiers[1].min = '99.99'; }, 'overlap'],
    ['negative', (d: ReturnType<typeof draftFromConfig>) => { d.tiers[0].cost = '-1'; }, '$0.00 or more'],
    ['blank amount', (d: ReturnType<typeof draftFromConfig>) => { d.tiers[0].cost = ''; }, 'Enter an amount'],
    ['no tiers', (d: ReturnType<typeof draftFromConfig>) => { d.tiers = []; }, 'Add at least one'],
    ['early open end', (d: ReturnType<typeof draftFromConfig>) => { d.tiers[0].max = ''; }, 'Only the last tier'],
    ['closed last tier', (d: ReturnType<typeof draftFromConfig>) => { d.tiers.at(-1)!.max = '900'; }, 'Leave the last'],
    ['nonzero start', (d: ReturnType<typeof draftFromConfig>) => { d.tiers[0].min = '0.01'; }, 'first tier'],
  ])('rejects %s', (_name, change, message) => {
    const draft = draftFromConfig(DEFAULT_CONFIG); change(draft);
    const result = validateSettings(draft);
    expect(result.config).toBeUndefined();
    expect(Object.values(result.errors).join(' ')).toContain(message);
  });
});

describe('loading settings', () => {
  it('migrates older saved rates without losing custom settings', () => {
    const { defaultTargetProfit: _target, ...legacy } = { ...DEFAULT_CONFIG, salesTaxBps: 1000 };
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(legacy) });
    expect(loadSettings()).toEqual({ ...legacy, defaultTargetProfit: 8000 });
  });
  it('loads a saved target and rejects invalid stored targets', () => {
    for (const defaultTargetProfit of [0, 9500, -1, '80', 100_000_000]) {
      vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ ...DEFAULT_CONFIG, defaultTargetProfit }) });
      expect(loadSettings().defaultTargetProfit).toBe(typeof defaultTargetProfit === 'number' && defaultTargetProfit >= 0 && defaultTargetProfit < 100_000_000 ? defaultTargetProfit : 8000);
    }
  });
  it.each(['{', 'null', '{}', JSON.stringify({ ...DEFAULT_CONFIG, warrantyTiers: [{ min: 0, max: null, cost: -1 }] }), JSON.stringify({ ...DEFAULT_CONFIG, warrantyTiers: [] })])('falls back for corrupt data %s', (raw) => {
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === SETTINGS_KEY ? raw : null });
    expect(loadSettings()).toEqual(DEFAULT_CONFIG);
  });
  it('falls back when storage is unavailable', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); } });
    expect(loadSettings()).toEqual(DEFAULT_CONFIG);
  });
});

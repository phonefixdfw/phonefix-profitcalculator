import { describe, expect, it, vi, afterEach } from 'vitest';
import { DEFAULT_CONFIG } from './config';
import { draftFromConfig, loadSettings, SETTINGS_KEY, validateSettings } from './settings';

afterEach(() => vi.unstubAllGlobals());

describe('settings validation', () => {
  it('accepts the default tiers and custom values', () => {
    const draft = draftFromConfig(DEFAULT_CONFIG);
    draft.salesTax = '10'; draft.cardFee = '3.25'; draft.cardFixedFee = '0.30'; draft.tiers[0].cost = '20';
    const config = validateSettings(draft).config!;
    expect(config).toMatchObject({ salesTaxBps: 1000, cardFeeBps: 325, cardFixedFee: 30 });
    expect(config.warrantyTiers[0]).toEqual({ min: 0, max: 9999, cost: 2000 });
  });
  it.each([
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
  it.each(['{', 'null', '{}', JSON.stringify({ ...DEFAULT_CONFIG, warrantyTiers: [{ min: 0, max: null, cost: -1 }] }), JSON.stringify({ ...DEFAULT_CONFIG, warrantyTiers: [] })])('falls back for corrupt data %s', (raw) => {
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === SETTINGS_KEY ? raw : null });
    expect(loadSettings()).toEqual(DEFAULT_CONFIG);
  });
  it('falls back when storage is unavailable', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); } });
    expect(loadSettings()).toEqual(DEFAULT_CONFIG);
  });
});

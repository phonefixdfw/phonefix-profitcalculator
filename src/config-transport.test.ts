import { describe, expect, it } from 'vitest';
import { findTargetPrice } from './calc';
import { DEFAULT_CONFIG, reviveTransportedConfig, type ShopConfig } from './config';

/** chrome.scripting.executeScript args lose `null` values; model that by dropping them. */
const transported = (config: ShopConfig) => JSON.parse(JSON.stringify(config, (_k, v) => (v === null ? undefined : v))) as ShopConfig;

describe('config sent to the extension result box (issue #31)', () => {
  it('loses the open-ended last tier max in transit, which would break top-tier prices', () => {
    const lost = transported(DEFAULT_CONFIG);
    expect(lost.warrantyTiers.at(-1)!.max).toBeUndefined();
    expect(() => findTargetPrice({ partCost: 41_888, targetProfit: 8_000, screenRepair: true, payment: 'card' }, lost)).toThrow(RangeError);
  });

  it('restores it so the $418.88 part gets the same answer as the web app', () => {
    const revived = reviveTransportedConfig(transported(DEFAULT_CONFIG));
    expect(revived).toEqual(DEFAULT_CONFIG);
    const input = { partCost: 41_888, targetProfit: 8_000, screenRepair: true, payment: 'card' } as const;
    expect(findTargetPrice(input, revived)?.minimum.price).toBe(findTargetPrice(input)?.minimum.price);
  });
});

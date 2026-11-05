import { describe, expect, it } from 'vitest';
import { calculateDiscountedTicket, calculateProfitPerHour, calculateTicket, findTargetPrice, type TargetProfitInput } from './calc';
import { DEFAULT_CONFIG } from './config';
import { MAX_MONEY_CENTS } from './money';

const target: TargetProfitInput = { partCost: 5_000, screenRepair: true, payment: 'card', targetProfit: 8_000 };
const original = { price: 9_300, partCost: 2_000, screenRepair: true, payment: 'card' as const };

describe('target-profit pricing', () => {
  it('matches the owner’s $162.03 example and verifies the preceding cent', () => {
    // 162.03 × .0825 = 13.367475 → 13.37; total 175.40.
    // 175.40 × .02 = 3.508 → 3.51; 162.03 − 50 − 3.51 − 28.52 = 80.
    const result = findTargetPrice(target)!;
    expect(result.minimum).toMatchObject({ price: 16_203, tax: 1_337, ticketTotal: 17_540, cardFee: 351, warranty: 2_852, netProfit: 8_000 });
    expect(calculateTicket({ ...target, price: 16_202 }).netProfit).toBe(7_999);
    expect(result.nice).toMatchObject({ price: 16_299, netProfit: 8_094 });
    expect(result.previousTierMaxPrice).toBe(13_856);
  });

  it('finds the first-tier cap even though later warranty cliffs reduce profit', () => {
    // 92.37 + 7.62 = 99.99; fee 2.00; profit 92.37 − 2 − 15.26 = 75.11.
    const result = findTargetPrice({ ...target, partCost: 0, targetProfit: 7_511 })!;
    expect(result.minimum).toMatchObject({ price: 9_237, ticketTotal: 9_999, netProfit: 7_511 });
    expect(calculateTicket({ ...target, partCost: 0, price: 9_236 }).netProfit).toBe(7_510);
    // Next .99 crosses the cliff: 92.99 − 2.01 − 21.89 = 69.09.
    expect(result.nice).toMatchObject({ price: 9_299, netProfit: 6_909, warrantyTierIndex: 1 });
  });

  it('can land exactly at a tier start when a configured warranty becomes cheaper', () => {
    const config = { ...DEFAULT_CONFIG, warrantyTiers: [{ min: 0, max: 9_999, cost: 1_526 }, { min: 10_000, max: null, cost: 1_000 }] };
    const result = findTargetPrice({ ...target, partCost: 0, targetProfit: 8_038 }, config)!;
    // 92.38 + 7.62 = 100.00; fee 2.00; warranty 10.00; profit 80.38.
    expect(result.minimum).toMatchObject({ price: 9_238, ticketTotal: 10_000, netProfit: 8_038 });
    expect(result.previousTierMaxPrice).toBe(9_237);
    // A lower target still cannot be reached in tier 1, but is exceeded as
    // soon as the cheaper tier starts. The search must include that first cent.
    expect(findTargetPrice({ ...target, partCost: 0, targetProfit: 7_600 }, config)?.minimum.price).toBe(9_238);
  });

  it('supports cash, non-screen repairs, zero targets and fixed fees', () => {
    expect(findTargetPrice({ ...target, payment: 'cash', screenRepair: false })?.minimum.price).toBe(13_000);
    expect(findTargetPrice({ ...target, payment: 'cash' })?.minimum.price).toBe(15_852);
    expect(findTargetPrice({ ...target, screenRepair: false })?.minimum.price).toBe(13_288);
    expect(findTargetPrice({ partCost: 0, targetProfit: 0, payment: 'cash', screenRepair: false })?.minimum.price).toBe(0);
    expect(findTargetPrice({ partCost: 100, targetProfit: 100, payment: 'card', screenRepair: false }, { ...DEFAULT_CONFIG, salesTaxBps: 0, cardFeeBps: 0, cardFixedFee: 30 })?.minimum.price).toBe(230);
    expect(findTargetPrice({ partCost: 99, targetProfit: 0, payment: 'cash', screenRepair: false })?.nice?.price).toBe(99);
  });

  it('returns no suggestion for unreachable targets, including excessive fees', () => {
    expect(findTargetPrice({ ...target, partCost: MAX_MONEY_CENTS, targetProfit: MAX_MONEY_CENTS })).toBeNull();
    expect(findTargetPrice(target, { ...DEFAULT_CONFIG, cardFeeBps: 10_000 })).toBeNull();
    expect(findTargetPrice(target, { ...DEFAULT_CONFIG, salesTaxBps: 1_000_000, cardFeeBps: 1_000_000 })).toBeNull();
  });

  it('handles near-100% fees in bounded work without assuming monotonic profit', () => {
    const config = { ...DEFAULT_CONFIG, salesTaxBps: 0, cardFeeBps: 9_999 };
    // At 5,000 cents the fee is 4,999.5 → 5,000. At 5,001 it is
    // 5,000.4999 → 5,000, so this is the first cent earning one cent.
    expect(findTargetPrice({ ...target, partCost: 0, screenRepair: false, targetProfit: 1 }, config)?.minimum.price).toBe(5_001);
    expect(findTargetPrice({ ...target, partCost: 0, screenRepair: false, targetProfit: 0 }, { ...config, salesTaxBps: 1 })?.minimum.price).toBe(0);
  });

  it('agrees with exhaustive cent searches under rounding jumps and edited tiers', () => {
    for (const [salesTaxBps, cardFeeBps] of [[825, 200], [5_000, 6_665], [5_000, 6_667], [0, 10_001], [0, 10_000], [100_000, 900]]) {
      const config = { ...DEFAULT_CONFIG, salesTaxBps, cardFeeBps, cardFixedFee: 1, warrantyTiers: [{ min: 0, max: 25, cost: 3 }, { min: 26, max: 100, cost: 15 }, { min: 101, max: null, cost: MAX_MONEY_CENTS }] };
      for (const targetProfit of [0, 1, 4, 10, 20]) {
        const input = { ...target, partCost: 2, targetProfit };
        let expected: number | null = null;
        for (let price = 0; price <= 100; price++) {
          if (calculateTicket({ ...input, price }, config).netProfit >= targetProfit) { expected = price; break; }
        }
        expect(findTargetPrice(input, config)?.minimum.price ?? null).toBe(expected);
      }
    }
  });

  it.each([-1, 1.5, NaN, Infinity, MAX_MONEY_CENTS + 1])('rejects invalid target %s', (targetProfit) => {
    expect(() => findTargetPrice({ ...target, targetProfit })).toThrow(RangeError);
  });
});

describe('discounted tickets', () => {
  it('recalculates every cost and flags a cheaper warranty across a tier', () => {
    // $93 → $92.37: total 99.99, fee 2, warranty 15.26. After $20 parts,
    // profit is 55.11 instead of 49.10, an increase of 6.01 despite the discount.
    const result = calculateDiscountedTicket(original, { kind: 'amount', value: 63 });
    expect(result).toMatchObject({ discountAmount: 63, profitCost: -601, cheaperWarrantyTier: true,
      original: { netProfit: 4_910 }, ticket: { price: 9_237, tax: 762, ticketTotal: 9_999, cardFee: 200, warranty: 1_526, netProfit: 5_511 } });
  });

  it('applies percentage discounts before rounded tax, fees and warranty', () => {
    // 10% off 100 = 90; tax 7.425 → 7.43; fee 97.43 × .02 → 1.95.
    const result = calculateDiscountedTicket({ ...original, price: 10_000, partCost: 0 }, { kind: 'percent', value: 1_000 });
    expect(result).toMatchObject({ discountAmount: 1_000, profitCost: 315, cheaperWarrantyTier: true,
      original: { netProfit: 7_594 }, ticket: { price: 9_000, tax: 743, ticketTotal: 9_743, cardFee: 195, warranty: 1_526, netProfit: 7_279 } });
    expect(calculateDiscountedTicket({ ...original, price: 1_001 }, { kind: 'percent', value: 5_000 }).discountAmount).toBe(501);
  });

  it.each(['amount', 'percent'] as const)('shows a finite loss on a full %s discount', (kind) => {
    const result = calculateDiscountedTicket(original, { kind, value: kind === 'amount' ? original.price : 10_000 });
    expect(result.ticket).toMatchObject({ price: 0, ticketTotal: 0, netProfit: -3_526, margin: null });
    expect(calculateDiscountedTicket(original, { kind, value: 0 }).ticket).toEqual(calculateTicket(original));
  });

  it('keeps cash and non-screen behavior and fixed card fees on free tickets', () => {
    expect(calculateDiscountedTicket({ ...original, payment: 'cash', screenRepair: false }, { kind: 'amount', value: 300 }).ticket).toMatchObject({ price: 9_000, cardFee: 0, warranty: 0, netProfit: 7_000 });
    expect(calculateDiscountedTicket(original, { kind: 'percent', value: 10_000 }, { ...DEFAULT_CONFIG, cardFixedFee: 30 }).ticket.netProfit).toBe(-3_556);
  });

  it.each([-1, 0.5, NaN, Infinity, MAX_MONEY_CENTS + 1])('rejects invalid discounts %s', (value) => {
    for (const kind of ['amount', 'percent'] as const) expect(() => calculateDiscountedTicket(original, { kind, value })).toThrow(RangeError);
  });
  it('rejects discounts exceeding price or 100%', () => {
    expect(() => calculateDiscountedTicket(original, { kind: 'amount', value: original.price + 1 })).toThrow(RangeError);
    expect(() => calculateDiscountedTicket(original, { kind: 'percent', value: 10_001 })).toThrow(RangeError);
  });
});

describe('profit per hour, without a labor cost', () => {
  it.each([[8_000, 4_500, 10_667], [1, 4_000, 2], [-1, 4_000, -2], [-3_526, 4_500, -4_701], [100, 50, 12_000], [0, 100, 0]])('rounds %i cents over %i hundredths of a minute to %i cents/hr', (profit, minutes, expected) => {
    expect(calculateProfitPerHour(profit, minutes)).toBe(expected);
  });
  it('returns null for missing or zero minutes', () => {
    expect(calculateProfitPerHour(8_000, null)).toBeNull();
    expect(calculateProfitPerHour(8_000, 0)).toBeNull();
  });
  it.each([-1, 1.5, NaN, Infinity, MAX_MONEY_CENTS + 1])('rejects invalid labor time %s', (minutes) => {
    expect(() => calculateProfitPerHour(8_000, minutes)).toThrow(RangeError);
  });
  it('keeps extreme supported values finite and rejects overflowing outputs', () => {
    expect(Number.isSafeInteger(calculateProfitPerHour(-1_000_000_000_000, 1))).toBe(true);
    expect(() => calculateProfitPerHour(Number.MAX_SAFE_INTEGER, 1)).toThrow(RangeError);
    expect(() => calculateProfitPerHour(NaN, 100)).toThrow(RangeError);
  });
});

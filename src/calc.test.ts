import { describe, expect, it } from 'vitest';
import { applyRate, calculateTicket, findWarrantyTier, getWarrantyTierReference, highestPriceForTotal, type TicketInput } from './calc';
import { DEFAULT_CONFIG, type ShopConfig } from './config';
import { MAX_MONEY_CENTS } from './money';

const ticket = (price: number, overrides: Partial<TicketInput> = {}) => calculateTicket({
  price, partCost: 0, payment: 'card', screenRepair: true, ...overrides,
});

describe('owner’s hand-worked tickets', () => {
  it.each([
    { price: 9_100, tax: 751, ticketTotal: 9_851, cardFee: 197, warranty: 1_526, warrantyTierIndex: 0, netProfit: 7_377 },
    { price: 9_300, tax: 767, ticketTotal: 10_067, cardFee: 201, warranty: 2_189, warrantyTierIndex: 1, netProfit: 6_910 },
    { price: 9_237, tax: 762, ticketTotal: 9_999, cardFee: 200, warranty: 1_526, warrantyTierIndex: 0, netProfit: 7_511 },
    { price: 9_238, tax: 762, ticketTotal: 10_000, cardFee: 200, warranty: 2_189, warrantyTierIndex: 1, netProfit: 6_849 },
  ])('calculates $price cents exactly', (expected) => {
    expect(ticket(expected.price)).toMatchObject(expected);
  });

  it('charges card fees on a non-screen repair without warranty or hints', () => {
    expect(ticket(9_300, { partCost: 2_000, screenRepair: false })).toMatchObject({
      tax: 767, ticketTotal: 10_067, cardFee: 201, warranty: 0, warrantyTierIndex: null,
      netProfit: 7_099, margin: 7_099 / 9_300, warrantyPricing: null,
    });
  });

  it('includes the screen warranty but no card fees for cash', () => {
    expect(ticket(9_300, { partCost: 2_000, payment: 'cash' })).toMatchObject({
      tax: 767, ticketTotal: 10_067, cardFee: 0, warranty: 2_189, netProfit: 5_111,
    });
  });

  it('keeps tax out of profit and represents a loss', () => {
    const result = ticket(9_300, { partCost: 10_000 });
    expect(result.netProfit).toBe(-3_090);
    expect(result.margin).toBe(-3_090 / 9_300);
  });

  it('guards zero price with a null margin', () => {
    expect(ticket(0)).toMatchObject({ tax: 0, ticketTotal: 0, cardFee: 0, netProfit: -1_526, margin: null });
  });
});

// Independent expectations: each tuple is [tax-included tier start, insurer cost].
const boundaries = [
  [0, 1_526], [10_000, 2_189], [15_000, 2_852], [20_000, 3_515],
  [25_000, 4_178], [30_000, 4_841], [35_000, 5_504], [40_000, 6_166],
  [45_000, 6_829], [50_000, 7_492], [55_000, 8_155], [60_000, 8_818],
] as const;

describe('every warranty tier boundary', () => {
  it.each(boundaries)('selects the correct tier just below, at and above %i cents', (start, cost) => {
    const index = boundaries.findIndex(([min]) => min === start);
    for (const total of [start, start + 1]) {
      const found = findWarrantyTier(total, DEFAULT_CONFIG.warrantyTiers);
      expect(found).toBe(index);
      expect(DEFAULT_CONFIG.warrantyTiers[found].cost).toBe(cost);
    }
    if (start > 0) {
      const found = findWarrantyTier(start - 1, DEFAULT_CONFIG.warrantyTiers);
      expect(found).toBe(index - 1);
      expect(DEFAULT_CONFIG.warrantyTiers[found].cost).toBe(boundaries[index - 1][1]);
    }
  });

  it.each([60_000, 60_001, 100_000, MAX_MONEY_CENTS])('covers the open-ended top tier at %i cents', (total) => {
    expect(findWarrantyTier(total, DEFAULT_CONFIG.warrantyTiers)).toBe(11);
  });

  it('keeps the configured tiers ordered, inclusive and contiguous', () => {
    expect(DEFAULT_CONFIG.warrantyTiers[0].min).toBe(0);
    DEFAULT_CONFIG.warrantyTiers.slice(0, -1).forEach((tier, index) => {
      expect(tier.max).toBe(DEFAULT_CONFIG.warrantyTiers[index + 1].min - 1);
    });
    expect(DEFAULT_CONFIG.warrantyTiers.at(-1)?.max).toBeNull();
  });
});

// Expected prices independently worked with decimal half-up tax.
const priceCaps = [
  [9_999, 9_237], [14_999, 13_856], [19_999, 18_475], [24_999, 23_094],
  [29_999, 27_713], [34_999, 32_332], [39_999, 36_951], [44_999, 41_569],
  [49_999, 46_188], [54_999, 50_807], [59_999, 55_426],
] as const;

describe('warranty tier quick reference', () => {
  it.each(priceCaps)('shows the hand-worked max price for ticket cap %i', (max, expectedPrice) => {
    const index = DEFAULT_CONFIG.warrantyTiers.findIndex((tier) => tier.max === max);
    const row = getWarrantyTierReference()[index];
    expect(row).toEqual({ ...DEFAULT_CONFIG.warrantyTiers[index], maxRepairPrice: expectedPrice });
    expect(ticket(row.maxRepairPrice!).warrantyTierIndex).toBe(index);
    expect(ticket(row.maxRepairPrice! + 1).warrantyTierIndex).toBe(index + 1);
  });

  it('leaves the open-ended tier without a maximum repair price', () => {
    expect(getWarrantyTierReference().at(-1)).toEqual({ min: 60_000, max: null, cost: 8_818, maxRepairPrice: null });
  });

  it('uses changed sales tax settings, including half-cent rounding', () => {
    const config = { ...DEFAULT_CONFIG, salesTaxBps: 1_000 };
    const rows = getWarrantyTierReference(config);
    // $90.90 + $9.09 = $99.99; $136.35 + $13.64 = $149.99;
    // $181.81 + $18.18 = $199.99. The next cent reaches the next tier.
    expect(rows.slice(0, 3).map((row) => row.maxRepairPrice)).toEqual([9_090, 13_635, 18_181]);
    rows.slice(0, -1).forEach((row, index) => {
      const input: TicketInput = { price: row.maxRepairPrice!, partCost: 0, payment: 'cash', screenRepair: true };
      expect(calculateTicket(input, config).warrantyTierIndex).toBe(index);
      expect(calculateTicket({ ...input, price: input.price + 1 }, config).warrantyTierIndex).toBe(index + 1);
    });
    expect(getWarrantyTierReference({ ...config, salesTaxBps: 0 })[0].maxRepairPrice).toBe(9_999);
  });

  it('follows an edited tier table and the same tax rounding when totals are skipped', () => {
    const config: ShopConfig = {
      ...DEFAULT_CONFIG, salesTaxBps: 5_000,
      warrantyTiers: [{ min: 0, max: 4, cost: 1 }, { min: 5, max: null, cost: 2 }],
    };
    expect(getWarrantyTierReference(config)).toEqual([
      { min: 0, max: 4, cost: 1, maxRepairPrice: 2 },
      { min: 5, max: null, cost: 2, maxRepairPrice: null },
    ]);
    expect(calculateTicket({ price: 2, partCost: 0, payment: 'cash', screenRepair: true }, config).ticketTotal).toBe(3);
    expect(calculateTicket({ price: 3, partCost: 0, payment: 'cash', screenRepair: true }, config).warrantyTierIndex).toBe(1);
  });
});

describe('warranty price limits and tier-cliff hints', () => {
  it.each(priceCaps)('finds the highest pre-tax price under total %i', (totalCap, priceCap) => {
    expect(highestPriceForTotal(totalCap, 825)).toBe(priceCap);
    const result = ticket(priceCap);
    expect(result.ticketTotal).toBeLessThanOrEqual(totalCap);
    expect(result.warrantyPricing?.currentTierMaxPrice).toBe(priceCap);
    const next = ticket(priceCap + 1);
    expect(next.ticketTotal).toBeGreaterThan(totalCap);
    expect(next.warrantyTierIndex).toBe(result.warrantyTierIndex! + 1);
    expect(ticket(priceCap - 1).warrantyTierIndex).toBe(result.warrantyTierIndex);
    expect(next.warrantyPricing?.lowerTierHint).toEqual({
      price: priceCap, profit: result.netProfit, warranty: result.warranty, gain: result.netProfit - next.netProfit,
    });
  });

  it('suggests $92.37 at $93, with the exact profit gain', () => {
    expect(ticket(9_300).warrantyPricing).toEqual({
      lowerTierHint: { price: 9_237, profit: 7_511, warranty: 1_526, gain: 601 },
      currentTierMaxPrice: 13_856,
    });
  });

  it('does not suggest a lower price in the first tier or when it earns less', () => {
    expect(ticket(9_100).warrantyPricing).toEqual({ lowerTierHint: null, currentTierMaxPrice: 9_237 });
    expect(ticket(12_000).warrantyPricing?.lowerTierHint).toBeNull();
  });

  it('suggests the lower tier when profit is equal', () => {
    expect(ticket(9_915).warrantyPricing?.lowerTierHint).toEqual({
      price: 9_237, profit: 7_511, warranty: 1_526, gain: 0,
    });
  });

  it('uses the same part cost and payment method for a suggestion', () => {
    expect(ticket(9_300, { payment: 'cash', partCost: 2_000 }).warrantyPricing?.lowerTierHint).toEqual({
      price: 9_237, profit: 5_711, warranty: 1_526, gain: 600,
    });
  });

  it('has no next tier cap at the top, while still allowing a lower-tier hint', () => {
    expect(ticket(55_427).warrantyPricing?.currentTierMaxPrice).toBeNull();
    expect(ticket(55_427).warrantyPricing?.lowerTierHint?.price).toBe(55_426);
    expect(ticket(MAX_MONEY_CENTS).warrantyPricing).toEqual({ lowerTierHint: null, currentTierMaxPrice: null });
  });

  it('handles tax rounding that skips a ticket total', () => {
    expect(highestPriceForTotal(3, 5_000)).toBe(2);
    expect(highestPriceForTotal(4, 5_000)).toBe(2);
    expect(highestPriceForTotal(9_999, 0)).toBe(9_999);
  });
});

describe('rounding, input safety and configurable rates', () => {
  it.each([[200, 825, 17], [25, 200, 1], [24, 200, 0], [0, 825, 0], [1, 5_000, 1]])(
    'rounds %i cents at %i basis points half-up to %i cents', (amount, rate, expected) => {
      expect(applyRate(amount, rate)).toBe(expected);
    },
  );

  it('accepts custom rates, a fixed fee and custom tiers without mutating inputs', () => {
    const config: ShopConfig = Object.freeze({
      salesTaxBps: 1_000, cardFeeBps: 250, cardFixedFee: 30,
      defaultTargetProfit: 8_000,
      warrantyTiers: Object.freeze([{ min: 0, max: 9_999, cost: 500 }, { min: 10_000, max: null, cost: 1_000 }]),
    });
    const input: TicketInput = Object.freeze({ price: 9_100, partCost: 2_000, payment: 'card', screenRepair: true });
    expect(calculateTicket(input, config)).toMatchObject({
      tax: 910, ticketTotal: 10_010, cardFee: 280, warranty: 1_000, netProfit: 5_820,
      warrantyPricing: { lowerTierHint: { price: 9_090, profit: 6_310, warranty: 500, gain: 490 }, currentTierMaxPrice: null },
    });
    expect(calculateTicket({ ...input, payment: 'cash' }, config).cardFee).toBe(0);
  });

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, MAX_MONEY_CENTS + 1])('rejects invalid cent input %s', (value) => {
    expect(() => ticket(value)).toThrow(RangeError);
    expect(() => ticket(100, { partCost: value })).toThrow(RangeError);
  });

  it('keeps maximum supported tickets finite', () => {
    const result = ticket(MAX_MONEY_CENTS, { partCost: MAX_MONEY_CENTS });
    expect(Number.isSafeInteger(result.netProfit)).toBe(true);
    expect(Number.isFinite(result.margin)).toBe(true);
  });
});

describe('individual shop setting changes', () => {
  const input: TicketInput = { price: 9_100, partCost: 0, payment: 'card', screenRepair: true };
  it('uses a changed tax rate for tax and the warranty tier', () => {
    expect(calculateTicket(input, { ...DEFAULT_CONFIG, salesTaxBps: 1_000 })).toMatchObject({ tax: 910, ticketTotal: 10_010, warranty: 2_189 });
  });
  it('uses a changed percentage and fixed card fee', () => {
    expect(calculateTicket(input, { ...DEFAULT_CONFIG, cardFeeBps: 300, cardFixedFee: 50 })).toMatchObject({ cardFee: 346, netProfit: 7_228 });
  });
  it('uses a changed warranty cost for the selected tier', () => {
    const warrantyTiers = DEFAULT_CONFIG.warrantyTiers.map((tier, index) => index === 0 ? { ...tier, cost: 2_000 } : tier);
    expect(calculateTicket(input, { ...DEFAULT_CONFIG, warrantyTiers })).toMatchObject({ warranty: 2_000, warrantyTierIndex: 0, netProfit: 6_903 });
  });
});

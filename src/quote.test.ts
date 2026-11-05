import { describe, expect, it } from 'vitest';
import { calculateDiscountedTicket, calculateTicket } from './calc';
import { DEFAULT_CONFIG } from './config';
import { formatQuote } from './quote';

const input = { price: 12999, partCost: 4321, screenRepair: true, payment: 'card' as const };

describe('customer quote text', () => {
  it('formats the name, cents and calculator-rounded tax total', () => {
    expect(formatQuote('iPhone 13 screen', calculateTicket(input))).toBe('iPhone 13 screen: $129.99 + tax = $140.71');
  });
  it.each([undefined, '', '   '])('uses Repair when no preset name is loaded: %s', (name) => {
    expect(formatQuote(name, calculateTicket(input))).toBe('Repair: $129.99 + tax = $140.71');
  });
  it('keeps the name on one line and formats thousands and zero tax', () => {
    const result = calculateTicket({ ...input, price: 123456 }, { ...DEFAULT_CONFIG, salesTaxBps: 0 });
    expect(formatQuote('  Tablet\nscreen  ', result)).toBe('Tablet screen: $1,234.56 + tax = $1,234.56');
  });
  it.each([
    ['amount' as const, 1000, 'Repair: $119.99 + tax = $129.89'],
    ['percent' as const, 1000, 'Repair: $116.99 + tax = $126.64'],
    ['percent' as const, 10000, 'Repair: $0.00 + tax = $0.00'],
  ])('uses the discounted price and total for %s discounts', (kind, value, expected) => {
    const discounted = calculateDiscountedTicket(input, { kind, value });
    expect(formatQuote(undefined, discounted.ticket)).toBe(expected);
  });
  it('never copies internal costs, profit, labor or full ticket objects', () => {
    const result = { ...calculateTicket(input), partCost: 11111, warranty: 22222, cardFee: 33333, netProfit: 44444, laborMinutes: 55555 };
    const quote = formatQuote('iPhone 13 screen', result);
    expect(quote).toBe('iPhone 13 screen: $129.99 + tax = $140.71');
    expect(quote).not.toMatch(/part|warranty|card|profit|labor|111|222|333|444|555/i);
  });
});

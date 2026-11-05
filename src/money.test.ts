import { describe, expect, it } from 'vitest';
import { formatMoney, parseMoney } from './money';

describe('dollar input', () => {
  it.each([['93', 9_300], ['92.37', 9_237], ['0', 0], ['0.01', 1], ['.5', 50], ['12.', 1_200], [' 12.50 ', 1_250], ['999999.99', 99_999_999], ['0001.05', 105]])(
    'parses %s into exactly %i cents', (value, cents) => {
      expect(parseMoney(value)).toEqual({ cents });
    },
  );

  it.each(['', ' ', '-1', '-0.01', 'abc', 'NaN', 'Infinity', '1e3', '1.001', '1,000', '.', '1000000', '999999999999999999999999999999999999999999999999'])('returns a short error for %s', (value) => {
    expect(parseMoney(value).error).toBeTruthy();
    expect(parseMoney(value).cents).toBeUndefined();
  });

  it('formats dollars, losses and zero', () => {
    expect(formatMoney(7_511)).toBe('$75.11');
    expect(formatMoney(-3_090)).toBe('-$30.90');
    expect(formatMoney(0)).toBe('$0.00');
  });
});

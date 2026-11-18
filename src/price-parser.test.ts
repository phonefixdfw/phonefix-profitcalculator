import { describe, expect, it } from 'vitest';
import { parseSelectedPrice } from './price-parser';

describe('parseSelectedPrice', () => {
  it.each([
    ['$16.38', 1638], ['$19.40', 1940], ['$37.03', 3703],
    [' $16.38 \n', 1638], ['16.38', 1638], ['$ 16.38', 1638], ['$16', 1600], ['$16.5', 1650], ['$.99', 99],
    ['$1,299.00', 129900], ['1,000', 100000], ['$999,999.99', 99999999],
    ['Price: $16.38', 1638], ['$16.38 USD', 1638], ['USD 16.38', 1638], ['$16.38USD', 1638], ['Now $19.40 each', 1940],
    ['$16.38', 1638], ['Total is $16.', 1600]
  ])('reads %j as %i cents', (text, cents) => expect(parseSelectedPrice(text)).toBe(cents));

  it.each([
    [''], ['   '], ['abc'], ['Out of stock'],
    ['$10 - $20'], ['$10 – $20'], ['$10 to $20'], ['$16.38 $19.40'], ['$20.00 $19.40'], ['iPhone 13 $16.38'],
    ['$16.384'], ['$1.2.3'], ['$1,23,4'], ['$12,34'], ['$1,2345.00'], ['$-5.00'], ['-$5.00'], ['16.38%'], ['15% off $16.38'],
    ['$0.00'], ['$0'], ['$1,000,000.00'], ['$16.38abc'], ['A16'], ['16GB'], ['SKU 12345'], ['Sale 16.38'], ['$$16.38'], ['1e5'],
  ])('rejects %j', (text) => expect(parseSelectedPrice(text)).toBeNull());

  it('never goes through floating point', () => {
    expect(parseSelectedPrice('$1,234.57')).toBe(123457);
    expect(parseSelectedPrice('$0.07')).toBe(7);
  });
});

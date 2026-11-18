import { parseMoney } from './money';

/**
 * Reads a highlighted vendor price into integer cents, or null when the text is
 * not one clean price. Never guesses: ranges, several numbers, negatives,
 * percentages and unmarked numbers inside other text are all rejected.
 */
export function parseSelectedPrice(selection: string): number | null {
  const text = selection.replace(/[   ]/g, ' ').trim();
  if (!text || text.length > 80) return null;
  if (/[-‐-―−%~]/.test(text)) return null; // ranges, negatives, discounts
  const numbers = [...text.matchAll(/\d[\d,]*(?:\.\d+)?|\.\d+/g)];
  if (numbers.length !== 1) return null;
  const [token] = numbers[0];
  // Plain digits, or correct thousands groups; at most two decimals.
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)?(?:\.\d{1,2})?$/.test(token)) return null;
  const before = text.slice(0, numbers[0].index!);
  const after = text.slice(numbers[0].index! + token.length);
  const usdAfter = /^\s*USD\b/i.test(after);
  // A letter glued to the number ("A16", "16GB") is a model or size, not a price.
  if (/[A-Za-z]$/.test(before) && !/\bUSD$/i.test(before)) return null;
  if (/^[A-Za-z]/.test(after) && !/^USD\b/i.test(after)) return null;
  const marked = /(?:\$|\bUSD)\s*$/i.test(before) || usdAfter;
  const rest = (before.replace(/\s*(?:US\$|USD|\$)\s*$/i, '') + after.replace(/^\s*USD\b/i, '')).trim();
  // Surrounding words ("Price: $16.38") need a currency marker; a bare number does not.
  if (rest && !marked) return null;
  if (rest.includes('$')) return null;
  const parsed = parseMoney(token.replace(/,/g, ''));
  return parsed.cents === undefined || parsed.cents <= 0 ? null : parsed.cents;
}

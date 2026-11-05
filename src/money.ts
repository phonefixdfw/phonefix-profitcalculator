/** A counter ticket is limited to $999,999.99 to reject accidental or enormous input. */
export const MAX_MONEY_CENTS = 99_999_999;

export type MoneyInput = { cents: number; error?: never } | { cents?: never; error: string };

export function parseMoney(value: string): MoneyInput {
  const trimmed = value.trim();
  if (!trimmed) return { error: 'Enter an amount.' };
  if (trimmed.startsWith('-')) return { error: 'Use an amount of $0.00 or more.' };
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(trimmed)) {
    return { error: 'Enter dollars and cents, like 93.00.' };
  }

  // Parse the decimal text directly so binary floating point cannot change a cent.
  const [dollars, fraction = ''] = trimmed.split('.');
  const whole = Number(dollars || '0');
  const cents = whole * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > MAX_MONEY_CENTS) {
    return { error: 'Use an amount up to $999,999.99.' };
  }
  return { cents };
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const formatMoney = (cents: number): string => usd.format(cents / 100);

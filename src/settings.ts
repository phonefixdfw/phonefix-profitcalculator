import { DEFAULT_CONFIG, type ShopConfig, type WarrantyTier } from './config';
import { MAX_MONEY_CENTS, parseMoney } from './money';

export const SETTINGS_KEY = 'phonefix-settings';
// Keeps calculations within safe integer range even for the largest supported ticket.
export const MAX_RATE_BPS = 1_000_000; // 10,000%

export interface SettingsDraft {
  salesTax: string;
  cardFee: string;
  cardFixedFee: string;
  defaultTargetProfit: string;
  tiers: { min: string; max: string; cost: string }[];
}

export interface SettingsValidation {
  config?: ShopConfig;
  errors: Record<string, string>;
}

export function draftFromConfig(config: ShopConfig): SettingsDraft {
  const decimal = (value: number) => (value / 100).toFixed(2);
  return {
    salesTax: decimal(config.salesTaxBps), cardFee: decimal(config.cardFeeBps),
    cardFixedFee: decimal(config.cardFixedFee),
    defaultTargetProfit: decimal(config.defaultTargetProfit),
    tiers: config.warrantyTiers.map(({ min, max, cost }) => ({
      min: decimal(min), max: max === null ? '' : decimal(max), cost: decimal(cost),
    })),
  };
}

export function validateSettings(draft: SettingsDraft): SettingsValidation {
  const errors: Record<string, string> = {};
  function amount(key: string, value: string, rate = false): number | undefined {
    const parsed = parseMoney(value);
    if (parsed.cents === undefined) {
      errors[key] = rate ? 'Enter a non-negative percentage with up to two decimal places.' : parsed.error;
      return undefined;
    }
    if (rate && parsed.cents > MAX_RATE_BPS) {
      errors[key] = 'Use a rate of 10,000% or less.';
      return undefined;
    }
    return parsed.cents;
  }
  const salesTaxBps = amount('salesTax', draft.salesTax, true);
  const cardFeeBps = amount('cardFee', draft.cardFee, true);
  const cardFixedFee = amount('cardFixedFee', draft.cardFixedFee);
  const defaultTargetProfit = amount('defaultTargetProfit', draft.defaultTargetProfit);
  const tiers: WarrantyTier[] = [];
  if (!draft.tiers.length) errors.tiers = 'Add at least one warranty tier, starting at $0.00 and ending with an open upper bound.';
  draft.tiers.forEach((tier, index) => {
    const min = amount(`tier-${index}-min`, tier.min);
    const max = tier.max.trim() ? amount(`tier-${index}-max`, tier.max) : null;
    const cost = amount(`tier-${index}-cost`, tier.cost);
    if (index === 0 && min !== undefined && min !== 0) errors[`tier-${index}-min`] = 'The first tier must start at $0.00.';
    if (index < draft.tiers.length - 1 && max === null) errors[`tier-${index}-max`] = 'Only the last tier can have a blank upper bound.';
    if (index === draft.tiers.length - 1 && max !== null) errors[`tier-${index}-max`] = 'Leave the last upper bound blank for “and up”.';
    if (min !== undefined && max !== undefined && max !== null && max < min) errors[`tier-${index}-max`] = 'The upper bound must be at least the lower bound.';
    const previous = tiers[index - 1];
    if (index > 0 && min !== undefined && previous?.max !== null && previous?.max !== undefined && min !== previous.max + 1) {
      errors[`tier-${index}-min`] = min <= previous.max ? 'Tiers overlap or are out of order. Start one cent after the previous upper bound.' : 'There is a gap. Start one cent after the previous upper bound.';
    }
    // Preserve indexes while validating other rows, even if this row is incomplete.
    tiers.push({ min: min ?? 0, max: max ?? null, cost: cost ?? 0 });
  });
  if (Object.keys(errors).length || salesTaxBps === undefined || cardFeeBps === undefined || cardFixedFee === undefined || defaultTargetProfit === undefined) return { errors };
  return { errors, config: { salesTaxBps, cardFeeBps, cardFixedFee, defaultTargetProfit, warrantyTiers: tiers } };
}

type StoredConfig = Omit<ShopConfig, 'defaultTargetProfit'> & { defaultTargetProfit?: number };

export function isStoredConfig(value: unknown): value is StoredConfig {
  if (!value || typeof value !== 'object') return false;
  const config = value as Record<string, unknown>;
  const validInt = (n: unknown, max: number) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= max;
  if (config.defaultTargetProfit !== undefined && !validInt(config.defaultTargetProfit, MAX_MONEY_CENTS)) return false;
  if (!validInt(config.salesTaxBps, MAX_RATE_BPS) || !validInt(config.cardFeeBps, MAX_RATE_BPS) || !validInt(config.cardFixedFee, MAX_MONEY_CENTS) || !Array.isArray(config.warrantyTiers) || !config.warrantyTiers.length) return false;
  return config.warrantyTiers.every((tier: unknown, index: number, tiers: unknown[]) => {
    if (!tier || typeof tier !== 'object') return false;
    const row = tier as Record<string, unknown>;
    if (!validInt(row.min, MAX_MONEY_CENTS) || !validInt(row.cost, MAX_MONEY_CENTS)) return false;
    if (index === 0 ? row.min !== 0 : row.min !== (tiers[index - 1] as WarrantyTier).max! + 1) return false;
    return index === tiers.length - 1 ? row.max === null : validInt(row.max, MAX_MONEY_CENTS) && (row.max as number) >= (row.min as number);
  });
}

export function loadSettings(): ShopConfig {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const value: unknown = JSON.parse(raw);
      // Older saved settings predate target pricing; keep their rates and tiers.
      if (isStoredConfig(value)) return { ...value, defaultTargetProfit: value.defaultTargetProfit ?? DEFAULT_CONFIG.defaultTargetProfit };
    }
  } catch { /* Storage may be unavailable or malformed. */ }
  return DEFAULT_CONFIG;
}

export function saveSettings(config: ShopConfig): boolean {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(config)); return true; } catch { return false; }
}

export function resetSettings(): boolean {
  try { localStorage.removeItem(SETTINGS_KEY); return true; } catch { return false; }
}

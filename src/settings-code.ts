import type { ShopConfig } from './config';
import { isStoredConfig } from './settings';

const MAX_CODE_LENGTH = 20_000;
const INVALID_CODE = 'Invalid or damaged settings code. Copy the complete code and try again.';

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function checksum(payload: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  // Detect copy/paste damage without adding a long digest to the QR link.
  return base64url(new Uint8Array(digest).slice(0, 12));
}

/** v1 contains only shop settings. Unknown versions must never be partially imported. */
export async function encodeSettingsCode(config: ShopConfig): Promise<string> {
  if (!isStoredConfig(config)) throw new Error('Save valid settings before sharing.');
  const payload = base64url(new TextEncoder().encode(JSON.stringify({
    v: 1,
    rates: [config.salesTaxBps, config.cardFeeBps, config.cardFixedFee],
    tiers: config.warrantyTiers.map(({ min, max, cost }) => [min, max, cost]),
  })));
  const code = `PF.${payload}.${await checksum(payload)}`;
  if (code.length > MAX_CODE_LENGTH) throw new Error('These settings are too large to share in a code.');
  return code;
}

export async function decodeSettingsCode(raw: string): Promise<ShopConfig> {
  const code = raw.trim();
  if (code.length > MAX_CODE_LENGTH) throw new Error(INVALID_CODE);
  const match = /^PF\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{16})$/.exec(code);
  if (!match || await checksum(match[1]) !== match[2]) throw new Error(INVALID_CODE);
  let value: unknown;
  try {
    const bytes = Uint8Array.from(atob(match[1].replaceAll('-', '+').replaceAll('_', '/')), (char) => char.charCodeAt(0));
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { throw new Error(INVALID_CODE); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(INVALID_CODE);
  const data = value as Record<string, unknown>;
  if (data.v !== 1) throw new Error('This settings code uses an unsupported version. Create a new code in the current app.');
  if (Object.keys(data).sort().join(',') !== 'rates,tiers,v' || !Array.isArray(data.rates) || data.rates.length !== 3 || !Array.isArray(data.tiers) || !data.tiers.every((tier) => Array.isArray(tier) && tier.length === 3)) throw new Error(INVALID_CODE);
  const config = {
    salesTaxBps: data.rates[0], cardFeeBps: data.rates[1], cardFixedFee: data.rates[2],
    warrantyTiers: data.tiers.map(([min, max, cost]: unknown[]) => ({ min, max, cost })),
  };
  if (!isStoredConfig(config)) throw new Error('The code contains invalid rates or warranty tiers. Nothing was changed.');
  return config;
}

export function settingsShareLink(code: string): string {
  return `https://calc.phone-fix.com/#settings=${code}`;
}

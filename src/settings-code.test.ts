import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './config';
import { decodeSettingsCode, encodeSettingsCode, settingsShareLink } from './settings-code';

async function envelope(data: unknown): Promise<string> {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return `PF.${payload}.${Buffer.from(digest).subarray(0, 12).toString('base64url')}`;
}
const validData = { v: 2, target: 8000, rates: [825, 200, 0], tiers: [[0, 9999, 1526], [10000, null, 2189]] };

describe('settings transfer codes', () => {
  it('round-trips every saved setting without losing cents or basis points', async () => {
    const config = { ...DEFAULT_CONFIG, salesTaxBps: 913, cardFeeBps: 299, cardFixedFee: 31, defaultTargetProfit: 9123 };
    const code = await encodeSettingsCode(config);
    expect(code).toMatch(/^PF\.[\w-]+\.[\w-]{16}$/);
    expect(code.length).toBeLessThan(600);
    expect(await decodeSettingsCode(` \n${code}\n `)).toEqual(config);
    expect(settingsShareLink(code)).toBe(`https://calc.phone-fix.com/#settings=${code}`);
  });

  it.each(['', 'not-a-code', 'PF..', 'PF.abc.def', 'PF.' + 'a'.repeat(20_001), 'eyJ2IjowfQ=='])('rejects malformed or legacy input', async (code) => {
    await expect(decodeSettingsCode(code)).rejects.toThrow(/Invalid or damaged/);
  });

  it('rejects tampered payloads, changed checksums and truncated codes', async () => {
    const code = await encodeSettingsCode(DEFAULT_CONFIG);
    const [, payload, digest] = code.split('.');
    const tampered = Buffer.from(JSON.stringify({ ...validData, rates: [0, 0, 0] })).toString('base64url');
    await expect(decodeSettingsCode(`PF.${tampered}.${digest}`)).rejects.toThrow(/Invalid or damaged/);
    await expect(decodeSettingsCode(`PF.${payload}.${digest[0] === 'a' ? 'b' : 'a'}${digest.slice(1)}`)).rejects.toThrow(/Invalid or damaged/);
    await expect(decodeSettingsCode(code.slice(0, -1))).rejects.toThrow(/Invalid or damaged/);
  });

  it.each([0, 1, 3, 99, '2', null])('rejects unsupported version %s without partial import', async (v) => {
    await expect(decodeSettingsCode(await envelope({ ...validData, v }))).rejects.toThrow(/unsupported version/);
  });

  it.each([
    null, [], {},
    { ...validData, target: undefined },
    { ...validData, target: null },
    { ...validData, target: -1 },
    { ...validData, target: 8000.5 },
    { ...validData, target: '8000' },
    { ...validData, target: 100_000_000 },
    { ...validData, rates: [-1, 200, 0] },
    { ...validData, rates: ['825', 200, 0] },
    { ...validData, rates: [825.5, 200, 0] },
    { ...validData, rates: [1_000_001, 200, 0] },
    { ...validData, rates: [825, 200, 100_000_000] },
    { ...validData, rates: [825, 200] },
    { ...validData, tiers: [[1, null, 100]] },
    { ...validData, tiers: [[0, 9999, 100], [10001, null, 100]] },
    { ...validData, tiers: [[0, 9999, 100], [9999, null, 100]] },
    { ...validData, tiers: [[0, null, -1]] },
    { ...validData, tiers: [[0, 100, 100]] },
    { ...validData, tiers: [] },
    { ...validData, tiers: [null] },
    { ...validData, tiers: [[0, null, 100, 'extra']] },
    { ...validData, presets: [] },
  ])('rejects invalid data even with a matching checksum', async (data) => {
    await expect(decodeSettingsCode(await envelope(data))).rejects.toThrow();
  });

  it('rejects invalid exports and excessive transfer sizes', async () => {
    await expect(encodeSettingsCode({ ...DEFAULT_CONFIG, cardFixedFee: -1 })).rejects.toThrow(/valid settings/);
    const warrantyTiers = Array.from({ length: 2000 }, (_, index) => ({ min: index, max: index === 1999 ? null : index, cost: 100 }));
    await expect(encodeSettingsCode({ ...DEFAULT_CONFIG, warrantyTiers })).rejects.toThrow(/too large/);
  });
});

import { MAX_MONEY_CENTS, parseMoney } from './money';

export const SAVED_REPAIRS_KEY = 'phonefix-saved-repairs';
export const SAVED_REPAIRS_VERSION = 1;
export const MAX_REPAIR_NAME_LENGTH = 120;

export interface SavedRepair {
  id: string;
  name: string;
  partCost: number;
  price: number;
  screenRepair: boolean;
  /** Integer hundredths of a minute, matching the calculator's labor input. */
  laborHundredths?: number;
}

export interface RepairDraft {
  name: string;
  partCost: string;
  price: string;
  screenRepair: boolean;
  laborMinutes: string;
}

export function validateRepair(draft: RepairDraft): { repair?: Omit<SavedRepair, 'id'>; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const name = draft.name.trim();
  if (!name || name.length > MAX_REPAIR_NAME_LENGTH) errors.name = `Enter a repair name up to ${MAX_REPAIR_NAME_LENGTH} characters.`;
  const part = parseMoney(draft.partCost);
  const price = parseMoney(draft.price);
  const labor = draft.laborMinutes.trim() ? parseMoney(draft.laborMinutes) : undefined;
  if (part.error) errors.partCost = part.error;
  if (price.error) errors.price = price.error;
  if (labor?.error) errors.laborMinutes = 'Enter minutes from 0 to 999,999.99, with up to two decimal places.';
  if (Object.keys(errors).length) return { errors };
  return { errors, repair: { name, partCost: part.cents!, price: price.cents!, screenRepair: draft.screenRepair,
    ...(labor ? { laborHundredths: labor.cents! } : {}) } };
}

function isSavedRepair(value: unknown): value is SavedRepair {
  if (!value || typeof value !== 'object') return false;
  const repair = value as Record<string, unknown>;
  const amount = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= MAX_MONEY_CENTS;
  return typeof repair.id === 'string' && Boolean(repair.id.trim())
    && typeof repair.name === 'string' && Boolean(repair.name.trim()) && repair.name.length <= MAX_REPAIR_NAME_LENGTH
    && amount(repair.partCost) && amount(repair.price) && typeof repair.screenRepair === 'boolean'
    && (repair.laborHundredths === undefined || amount(repair.laborHundredths));
}

function validRepairs(value: unknown): value is SavedRepair[] {
  return Array.isArray(value) && value.every(isSavedRepair) && new Set(value.map((repair) => repair.id)).size === value.length;
}

export function loadSavedRepairs(): SavedRepair[] {
  try {
    const raw = localStorage.getItem(SAVED_REPAIRS_KEY);
    const stored: unknown = raw ? JSON.parse(raw) : null;
    if (stored && typeof stored === 'object') {
      const { version, repairs } = stored as Record<string, unknown>;
      // Unknown versions are never interpreted as the current schema.
      if (version === SAVED_REPAIRS_VERSION && validRepairs(repairs)) return repairs;
    }
  } catch { /* Missing, blocked or corrupt browser storage starts with an empty list. */ }
  return [];
}

export function saveSavedRepairs(repairs: SavedRepair[]): boolean {
  if (!validRepairs(repairs)) return false;
  try {
    localStorage.setItem(SAVED_REPAIRS_KEY, JSON.stringify({ version: SAVED_REPAIRS_VERSION, repairs }));
    return true;
  } catch { return false; }
}

import { DEFAULT_CONFIG, type ShopConfig, type WarrantyTier } from './config';
import { MAX_MONEY_CENTS } from './money';

export interface TicketInput {
  readonly price: number;
  readonly partCost: number;
  readonly screenRepair: boolean;
  readonly payment: 'card' | 'cash';
}

export interface TierCliffHint {
  readonly price: number;
  readonly profit: number;
  readonly warranty: number;
  readonly gain: number;
}

export interface WarrantyPricing {
  /** Only present when the lower tier's best price earns at least the current profit. */
  readonly lowerTierHint: TierCliffHint | null;
  /** null means the current tier is open-ended. */
  readonly currentTierMaxPrice: number | null;
}

export interface TicketResult {
  readonly price: number;
  readonly partCost: number;
  readonly tax: number;
  readonly ticketTotal: number;
  readonly cardFee: number;
  readonly warranty: number;
  readonly warrantyTierIndex: number | null;
  readonly netProfit: number;
  readonly margin: number | null;
  readonly warrantyPricing: WarrantyPricing | null;
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}

/** Exact half-up rounding of a non-negative cent amount times a basis-point rate. */
export function applyRate(cents: number, basisPoints: number): number {
  assertNonNegativeInteger(cents, 'Amount');
  assertNonNegativeInteger(basisPoints, 'Rate');
  const rounded = (BigInt(cents) * BigInt(basisPoints) + 5_000n) / 10_000n;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Amount is too large.');
  return Number(rounded);
}

function ticketTotal(price: number, salesTaxBps: number): number {
  const total = price + applyRate(price, salesTaxBps);
  if (!Number.isSafeInteger(total)) throw new RangeError('Ticket total is too large.');
  return total;
}

export function findWarrantyTier(total: number, tiers: readonly WarrantyTier[]): number {
  assertNonNegativeInteger(total, 'Ticket total');
  const index = tiers.findIndex((tier) => total >= tier.min && (tier.max === null || total <= tier.max));
  if (index === -1) throw new RangeError('No warranty tier covers this ticket total.');
  return index;
}

/** Invert the rounded tax calculation, including cases where a total is skipped. */
export function highestPriceForTotal(maxTotal: number, salesTaxBps: number): number {
  assertNonNegativeInteger(maxTotal, 'Maximum ticket total');
  assertNonNegativeInteger(salesTaxBps, 'Sales tax rate');
  let low = 0;
  let high = maxTotal;
  while (low < high) {
    const mid = low + Math.ceil((high - low) / 2);
    if (ticketTotal(mid, salesTaxBps) <= maxTotal) low = mid;
    else high = mid - 1;
  }
  return low;
}

function calculateBase(input: TicketInput, config: ShopConfig): Omit<TicketResult, 'warrantyPricing'> {
  const tax = applyRate(input.price, config.salesTaxBps);
  const total = ticketTotal(input.price, config.salesTaxBps);
  const cardFee = input.payment === 'card' ? applyRate(total, config.cardFeeBps) + config.cardFixedFee : 0;
  const warrantyTierIndex = input.screenRepair ? findWarrantyTier(total, config.warrantyTiers) : null;
  const warranty = warrantyTierIndex === null ? 0 : config.warrantyTiers[warrantyTierIndex].cost;
  const netProfit = input.price - input.partCost - cardFee - warranty;
  if (!Number.isSafeInteger(cardFee) || !Number.isSafeInteger(netProfit)) {
    throw new RangeError('Result is too large.');
  }
  return {
    price: input.price,
    partCost: input.partCost,
    tax,
    ticketTotal: total,
    cardFee,
    warranty,
    warrantyTierIndex,
    netProfit,
    margin: input.price === 0 ? null : netProfit / input.price,
  };
}

/** Money stays in cents throughout. Tax is pass-through, so it is not subtracted from profit. */
export function calculateTicket(input: TicketInput, config: ShopConfig = DEFAULT_CONFIG): TicketResult {
  for (const [name, amount] of [['Price', input.price], ['Part cost', input.partCost]] as const) {
    assertNonNegativeInteger(amount, name);
    if (amount > MAX_MONEY_CENTS) throw new RangeError(`${name} is too large.`);
  }
  assertNonNegativeInteger(config.cardFixedFee, 'Fixed card fee');
  const result = calculateBase(input, config);
  let warrantyPricing: WarrantyPricing | null = null;
  if (result.warrantyTierIndex !== null) {
    const tier = config.warrantyTiers[result.warrantyTierIndex];
    const maxPrice = tier.max === null ? null : highestPriceForTotal(tier.max, config.salesTaxBps);
    let lowerTierHint: TierCliffHint | null = null;
    if (result.warrantyTierIndex > 0) {
      const lowerTier = config.warrantyTiers[result.warrantyTierIndex - 1];
      const price = highestPriceForTotal(lowerTier.max!, config.salesTaxBps);
      const lower = calculateBase({ ...input, price }, config);
      const gain = lower.netProfit - result.netProfit;
      if (gain >= 0) lowerTierHint = { price, profit: lower.netProfit, warranty: lower.warranty, gain };
    }
    warrantyPricing = { lowerTierHint, currentTierMaxPrice: maxPrice };
  }
  return { ...result, warrantyPricing };
}

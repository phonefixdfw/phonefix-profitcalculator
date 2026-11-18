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

export interface WarrantyTierReference extends WarrantyTier {
  /** null means this tier has no upper limit. */
  readonly maxRepairPrice: number | null;
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

/** Use the calculator's rounded tax search for every tier in the active settings. */
export function getWarrantyTierReference(config: ShopConfig = DEFAULT_CONFIG): WarrantyTierReference[] {
  return config.warrantyTiers.map((tier) => ({
    ...tier,
    maxRepairPrice: tier.max === null ? null : highestPriceForTotal(tier.max, config.salesTaxBps),
  }));
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

/** Amount is cents; percent is basis points (100 = 1%). */
export interface Discount {
  readonly kind: 'amount' | 'percent';
  readonly value: number;
}

export function calculateDiscountedTicket(input: TicketInput, discount: Discount, config: ShopConfig = DEFAULT_CONFIG) {
  const original = calculateTicket(input, config);
  assertNonNegativeInteger(discount.value, 'Discount');
  const limit = discount.kind === 'percent' ? 10_000 : input.price;
  if (discount.value > limit) throw new RangeError('Discount cannot exceed the repair price or 100%.');
  const discountAmount = discount.kind === 'percent' ? applyRate(input.price, discount.value) : discount.value;
  const ticket = calculateTicket({ ...input, price: input.price - discountAmount }, config);
  return {
    original, ticket, discountAmount,
    profitCost: original.netProfit - ticket.netProfit,
    cheaperWarrantyTier: ticket.warranty < original.warranty,
  };
}

/** Minutes use hundredths, parsed directly from decimal text, like money inputs. */
export function calculateProfitPerHour(netProfit: number, laborMinutesHundredths: number | null): number | null {
  if (!Number.isSafeInteger(netProfit)) throw new RangeError('Profit must be safe integer cents.');
  if (laborMinutesHundredths === null || laborMinutesHundredths === 0) return null;
  assertNonNegativeInteger(laborMinutesHundredths, 'Labor minutes');
  if (laborMinutesHundredths > MAX_MONEY_CENTS) throw new RangeError('Labor minutes are too large.');
  const numerator = BigInt(Math.abs(netProfit)) * 6_000n;
  const denominator = BigInt(laborMinutesHundredths);
  const rounded = (2n * numerator + denominator) / (2n * denominator);
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Hourly profit is too large.');
  return rounded === 0n ? 0 : Number(rounded) * (netProfit < 0 ? -1 : 1);
}

export interface TargetProfitInput extends Omit<TicketInput, 'price'> {
  readonly targetProfit: number;
}

export interface TargetPriceResult {
  readonly minimum: TicketResult;
  /** null if the next .99 price exceeds the counter's price limit. */
  readonly nice: TicketResult | null;
  readonly previousTierMaxPrice: number | null;
  /**
   * Screen repairs only: the highest pre-tax price whose tax-included total
   * stays in the minimum's warranty tier, so the warranty cost is unchanged.
   * null when the warranty is off or the tier is open-ended (no cap).
   */
  readonly topOfTier: TicketResult | null;
  /** Extra warranty cost of the next tier up; null when warranty is off or there is none. */
  readonly nextTierWarrantyIncrease: number | null;
  /**
   * Set when the minimum is in tier 2+ and the preceding tier's top price falls
   * short of the target by no more than NEAR_BOUNDARY_SHORTFALL cents.
   */
  readonly lowerTierNearMiss: LowerTierNearMiss | null;
}

export interface LowerTierNearMiss {
  readonly price: number;
  readonly profit: number;
  readonly shortfall: number;
  /** Warranty cost added by the higher tier. */
  readonly warrantyIncrease: number;
  /** Extra pre-tax price the target price needs over the lower tier's top price. */
  readonly extraRevenue: number;
}

/** "Nearly reaches" the target: the lower tier's best price is within $5.00. */
export const NEAR_BOUNDARY_SHORTFALL = 500;

function floorDivide(n: bigint, positiveDivisor: bigint): bigint {
  const quotient = n / positiveDivisor;
  return n < 0n && n % positiveDivisor !== 0n ? quotient - 1n : quotient;
}

const ceilDivide = (n: bigint, d: bigint) => -floorDivide(-n, d);

/**
 * Search each tier separately: profit can drop at a warranty cliff and even
 * within a tier at unusual tax/card rates. Never binary-search net profit.
 */
export function findTargetPrice(input: TargetProfitInput, config: ShopConfig = DEFAULT_CONFIG): TargetPriceResult | null {
  assertNonNegativeInteger(input.targetProfit, 'Target profit');
  if (input.targetProfit > MAX_MONEY_CENTS) throw new RangeError('Target profit is too large.');
  calculateTicket({ ...input, price: 0 }, config); // Validate parts and calculation settings.
  const rate = BigInt(input.payment === 'card' ? config.cardFeeBps : 0);
  const slope = 100_000_000n - rate * (10_000n + BigInt(config.salesTaxBps));
  // Combined tax/fee rounding differs from the unrounded fee by at most this
  // numerator over 100,000,000. This makes the ordinary cent search very small.
  const roundingBound = (rate + 10_000n) * 5_000n;
  const tiers = input.screenRepair ? config.warrantyTiers : [{ min: 0, max: null, cost: 0 }];
  let low = 0;
  for (const tier of tiers) {
    const high = tier.max === null ? MAX_MONEY_CENTS : Math.min(MAX_MONEY_CENTS, highestPriceForTotal(tier.max, config.salesTaxBps));
    const cost = BigInt(input.partCost) + BigInt(input.targetProfit) + BigInt(tier.cost)
      + BigInt(input.payment === 'card' ? config.cardFixedFee : 0);
    let start = Math.max(low, Number(cost));
    let end = high;
    if (slope > 0n) {
      start = Math.max(start, Number(ceilDivide(cost * 100_000_000n - roundingBound, slope)));
      // A cheaper configured tier may already meet the target at its first cent.
      end = Math.min(end, Math.max(start, Number(ceilDivide(cost * 100_000_000n + roundingBound, slope))));
    }
    let best: number | null = null;
    if (start <= end && end - start < 10_000) {
      for (let price = start; price <= end; price++) {
        if (calculateTicket({ ...input, price }, config).netProfit >= input.targetProfit) { best = price; break; }
      }
    } else if (start <= end) {
      // Near a 100% effective fee, scanning cents could take millions of steps.
      // Write price = 10,000*k + r. Tax rounding repeats for each r; the exact
      // half-up fee inequality becomes slope*k >= rhs, with no approximation.
      // round(rate*total/10,000) <= price-cost is equivalent to
      // rate*total <= 10,000*(price-cost) + 4,999.
      for (let r = 0; r < 10_000 && r <= end; r++) {
        let k = BigInt(Math.max(0, Math.ceil((start - r) / 10_000)));
        const maxK = BigInt(Math.floor((end - r) / 10_000));
        const totalR = BigInt(r + applyRate(r, config.salesTaxBps));
        const rhs = cost * 10_000n + rate * totalR - BigInt(r) * 10_000n - 4_999n;
        if (slope > 0n) k = k > ceilDivide(rhs, slope) ? k : ceilDivide(rhs, slope);
        if (k > maxK || slope * k < rhs) continue;
        const price = Number(k) * 10_000 + r;
        if (best === null || price < best) best = price;
      }
    }
    if (best !== null) {
      const minimum = calculateTicket({ ...input, price: best }, config);
      if (minimum.netProfit < input.targetProfit) throw new Error('Target price verification failed.');
      const nicePrice = Math.floor(best / 100) * 100 + 99;
      const index = minimum.warrantyTierIndex;
      let topOfTier: TicketResult | null = null;
      let nextTierWarrantyIncrease: number | null = null;
      let lowerTierNearMiss: LowerTierNearMiss | null = null;
      if (index !== null) {
        const tiers = config.warrantyTiers;
        if (tiers[index].max !== null) {
          const topPrice = Math.min(MAX_MONEY_CENTS, highestPriceForTotal(tiers[index].max, config.salesTaxBps));
          topOfTier = calculateTicket({ ...input, price: topPrice }, config);
          if (topOfTier.warrantyTierIndex !== index || topOfTier.ticketTotal > tiers[index].max) {
            throw new Error('Top-of-tier verification failed.');
          }
        }
        if (index + 1 < tiers.length) nextTierWarrantyIncrease = tiers[index + 1].cost - tiers[index].cost;
        if (index > 0) {
          const lowerTop = highestPriceForTotal(tiers[index - 1].max!, config.salesTaxBps);
          const lower = calculateTicket({ ...input, price: lowerTop }, config);
          const shortfall = input.targetProfit - lower.netProfit;
          if (shortfall > 0 && shortfall <= NEAR_BOUNDARY_SHORTFALL) {
            lowerTierNearMiss = {
              price: lowerTop, profit: lower.netProfit, shortfall,
              warrantyIncrease: tiers[index].cost - tiers[index - 1].cost,
              extraRevenue: minimum.price - lowerTop,
            };
          }
        }
      }
      return {
        minimum,
        nice: nicePrice <= MAX_MONEY_CENTS ? calculateTicket({ ...input, price: nicePrice }, config) : null,
        previousTierMaxPrice: index !== null && index > 0
          ? highestPriceForTotal(config.warrantyTiers[index - 1].max!, config.salesTaxBps) : null,
        topOfTier, nextTierWarrantyIncrease, lowerTierNearMiss,
      };
    }
    low = high + 1;
    if (low > MAX_MONEY_CENTS) break;
  }
  return null;
}

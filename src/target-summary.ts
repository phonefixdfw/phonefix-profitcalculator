import type { TargetPriceResult } from './calc';
import { formatMoney } from './money';

export interface TargetSummary {
  /** Screen repairs only: the recommended top-of-tier price and its note. */
  readonly topOfTier: { readonly price: string; readonly note: string } | null;
  /** The "Drop a tier?" sentence, when it applies. */
  readonly dropTier: string | null;
}

/** Shared wording for the web app and the extension's result box. */
export function summarizeTarget(suggestion: TargetPriceResult): TargetSummary {
  const result = suggestion.minimum;
  const top = suggestion.topOfTier;
  let topOfTier: TargetSummary['topOfTier'] = null;
  if (result.warrantyTierIndex !== null) {
    const tier = result.warrantyTierIndex + 1;
    if (!top) {
      topOfTier = { price: 'None', note: `Tier ${tier} has no cap, so there is no top-of-tier price.` };
    } else {
      const next = suggestion.nextTierWarrantyIncrease;
      topOfTier = {
        price: formatMoney(top.price),
        note: top.price === result.price
          ? `Already the top of tier ${tier}; the next tier adds ${next === null ? 'warranty cost' : `${formatMoney(next)} warranty`}.`
          : `Total ${formatMoney(top.ticketTotal)} with tax, still tier ${tier}, same warranty. +${formatMoney(top.netProfit - result.netProfit)} profit.`,
      };
    }
  }
  const drop = suggestion.dropTier;
  let dropTier: string | null = null;
  if (drop) {
    const miss = drop.shortfall > 0 ? `misses target by ${formatMoney(drop.shortfall)}` : 'hits target';
    const rec = top && top.price !== result.price ? ` / ${formatMoney(top.netProfit)} at ${formatMoney(top.price)}` : '';
    dropTier = `Drop a tier? ${formatMoney(drop.price)} earns ${formatMoney(drop.profit)} (${miss}, saves ${formatMoney(drop.warrantySaved)} warranty) vs ${formatMoney(result.netProfit)} at ${formatMoney(result.price)}${rec}.`;
  }
  return { topOfTier, dropTier };
}

/** All money is integer cents; percentage rates are integer basis points (1% = 100). */
export interface WarrantyTier {
  readonly min: number;
  readonly max: number | null;
  readonly cost: number;
}

export interface ShopConfig {
  readonly salesTaxBps: number;
  readonly cardFeeBps: number;
  readonly cardFixedFee: number;
  readonly defaultTargetProfit: number;
  readonly warrantyTiers: readonly WarrantyTier[];
}

/** Owner-supplied PhoneFix DFW rates. Pass another ShopConfig to calculateTicket for settings. */
export const DEFAULT_CONFIG: ShopConfig = {
  salesTaxBps: 825,
  cardFeeBps: 200,
  cardFixedFee: 0,
  defaultTargetProfit: 8_000,
  warrantyTiers: [
    { min: 0, max: 9_999, cost: 1_526 },
    { min: 10_000, max: 14_999, cost: 2_189 },
    { min: 15_000, max: 19_999, cost: 2_852 },
    { min: 20_000, max: 24_999, cost: 3_515 },
    { min: 25_000, max: 29_999, cost: 4_178 },
    { min: 30_000, max: 34_999, cost: 4_841 },
    { min: 35_000, max: 39_999, cost: 5_504 },
    { min: 40_000, max: 44_999, cost: 6_166 },
    { min: 45_000, max: 49_999, cost: 6_829 },
    { min: 50_000, max: 54_999, cost: 7_492 },
    { min: 55_000, max: 59_999, cost: 8_155 },
    { min: 60_000, max: null, cost: 8_818 },
  ],
};

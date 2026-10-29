export const STANDARD_DEPOSIT_CENTS = 5000;
export const HOME_PREORDER_DEPOSIT_CENTS = 500_000;
export const TECHNOLOGY_FEE_CENTS = 500;

/**
 * Amount due today under the deposit checkout option. Pay-in-full callers
 * pass the whole total separately; this helper only caps the deposit slice
 * so the cap lives in exactly one place.
 */
export const getCheckoutDepositCents = (totalCents: number) =>
  Math.min(STANDARD_DEPOSIT_CENTS, totalCents);

export {
  SERVICE_HQ,
  TRAVEL_FEE_CONFIG,
  buildTravelEstimate,
  calculateTipAmountCents,
  calculateTravelFeeCents,
  estimateDriveMinutes,
  estimateRoadDistanceMiles,
  milesBetweenCoordinates,
  TIP_PERCENT_OPTIONS,
} from "./travel";
export type { TipPercentOption, TravelEstimate, TravelFeeKind } from "./travel";

export const LAWNCARE_LOT_SIZE_ACRES = {
  customQuoteAt: 2,
  largeAt: 1,
  mediumAt: 0.55,
} as const;

export const LAWNCARE_PLAN_PRICES = {
  "groundskeeper-bi-weekly": 12_500,
  "groundskeeper-bi-weekly-large": 50_000,
  "groundskeeper-bi-weekly-medium": 25_000,
  "groundskeeper-commercial": 30_000,
  "groundskeeper-custom-quote-deposit": STANDARD_DEPOSIT_CENTS,
  "groundskeeper-monthly": 7500,
  "groundskeeper-monthly-large": 30_000,
  "groundskeeper-monthly-medium": 15_000,
  "groundskeeper-one-time": 7500,
  "groundskeeper-one-time-large": 30_000,
  "groundskeeper-one-time-medium": 15_000,
} as const;

export type LawncarePlanId = keyof typeof LAWNCARE_PLAN_PRICES;

export const LAWNCARE_PLAN_LABELS = {
  "groundskeeper-bi-weekly": "Groundskeeper Bi-Weekly Small",
  "groundskeeper-bi-weekly-large": "Groundskeeper Bi-Weekly Large",
  "groundskeeper-bi-weekly-medium": "Groundskeeper Bi-Weekly Medium",
  "groundskeeper-commercial": "Groundskeeper Large Lot",
  "groundskeeper-custom-quote-deposit": "Groundskeeper Custom Quote Deposit",
  "groundskeeper-monthly": "Groundskeeper Monthly Small",
  "groundskeeper-monthly-large": "Groundskeeper Monthly Large",
  "groundskeeper-monthly-medium": "Groundskeeper Monthly Medium",
  "groundskeeper-one-time": "Groundskeeper Small Lot",
  "groundskeeper-one-time-large": "Groundskeeper Large Lot",
  "groundskeeper-one-time-medium": "Groundskeeper Medium Lot",
} as const satisfies Record<LawncarePlanId, string>;

export const LAUNDRY_PLAN_PRICES = {
  "royal-wash-basic": 4000,
  "royal-wash-deluxe": 6000,
  "royal-wash-supreme": 20_000,
} as const;

export type LaundryPlanId = keyof typeof LAUNDRY_PLAN_PRICES;

export const LAUNDRY_PLAN_LABELS = {
  "royal-wash-basic": "Royal Wash",
  "royal-wash-deluxe": "Royal Wash + Bedding",
  "royal-wash-supreme": "Royal Wash Supreme",
} as const satisfies Record<LaundryPlanId, string>;

export const WINDOW_WASHING_SUBSCRIPTION_PRICES = {
  "royal-pane-bi-annual": 36_000,
  "royal-pane-monthly": 12_500,
} as const;

export const COMBO_SUBSCRIPTION_PRICES = {
  "bi-weekly-royal-duo-large": 62_500,
  "bi-weekly-royal-duo-medium": 37_500,
  "bi-weekly-royal-duo-small": 25_000,
  "crown-estate-trio-deluxe-large": 92_500,
  "crown-estate-trio-deluxe-medium": 67_500,
  "crown-estate-trio-deluxe-small": 36_000,
  "crown-estate-trio-large": 77_500,
  "crown-estate-trio-medium": 52_500,
  "crown-estate-trio-small": 30_000,
  "monthly-castle-care-large": 50_000,
  "monthly-castle-care-medium": 30_000,
  "monthly-castle-care-small": 20_000,
  "royal-linen-panes-duo": 28_000,
} as const;

export const LAWNCARE_SERVICE_HOURS = {
  endHourLocal: 20,
  startHourLocal: 6,
} as const;

export type LawncareFrequency = "bi_weekly" | "monthly" | "one_time";
export type LawncareLotTier = "custom" | "large" | "medium" | "small";

export const getLawncareLotTier = (
  lotSizeAcres?: number | null
): LawncareLotTier => {
  if (!lotSizeAcres || !Number.isFinite(lotSizeAcres) || lotSizeAcres <= 0) {
    return "small";
  }

  if (lotSizeAcres > LAWNCARE_LOT_SIZE_ACRES.customQuoteAt) {
    return "custom";
  }

  if (lotSizeAcres >= LAWNCARE_LOT_SIZE_ACRES.largeAt) {
    return "large";
  }

  if (lotSizeAcres >= LAWNCARE_LOT_SIZE_ACRES.mediumAt) {
    return "medium";
  }

  return "small";
};

export const getLawncarePlanId = ({
  frequency,
  lotSizeAcres,
}: {
  frequency: LawncareFrequency;
  lotSizeAcres?: number | null;
}): LawncarePlanId => {
  const tier = getLawncareLotTier(lotSizeAcres);

  if (tier === "custom") {
    return "groundskeeper-custom-quote-deposit";
  }

  if (frequency === "bi_weekly") {
    if (tier === "large") {
      return "groundskeeper-bi-weekly-large";
    }
    if (tier === "medium") {
      return "groundskeeper-bi-weekly-medium";
    }
    return "groundskeeper-bi-weekly";
  }

  if (frequency === "monthly") {
    if (tier === "large") {
      return "groundskeeper-monthly-large";
    }
    if (tier === "medium") {
      return "groundskeeper-monthly-medium";
    }
    return "groundskeeper-monthly";
  }

  if (tier === "large") {
    return "groundskeeper-one-time-large";
  }
  if (tier === "medium") {
    return "groundskeeper-one-time-medium";
  }
  return "groundskeeper-one-time";
};

export const getLawncarePricingTier = (
  planId: LawncarePlanId
): LawncareLotTier => {
  if (planId.includes("custom-quote")) {
    return "custom";
  }
  if (planId.includes("large") || planId.includes("commercial")) {
    return "large";
  }
  if (planId.includes("medium")) {
    return "medium";
  }
  return "small";
};

import type {
  CheckoutPreviewItemInput,
  CheckoutPreviewLineItem,
  CheckoutPreviewRequest,
  TimingType,
} from "@callcastlecare/api";
import {
  COMBO_SUBSCRIPTION_PRICES,
  HOME_PREORDER_DEPOSIT_CENTS,
  LAUNDRY_PLAN_LABELS,
  LAUNDRY_PLAN_PRICES,
  LAWNCARE_PLAN_LABELS,
  LAWNCARE_PLAN_PRICES,
  TECHNOLOGY_FEE_CENTS,
  WINDOW_WASHING_SUBSCRIPTION_PRICES,
  calculateTravelFeeCents,
  calculateWindowWashingQuote,
  getLawncarePricingTier,
  getRecurringServiceUnits,
} from "@callcastlecare/api";
import { getHomePriceCents, homeModels } from "@callcastlecare/api/homes";

type PricingTier = "custom" | "large" | "medium" | "small";

export type CheckoutServiceType = "lawncare" | "laundry" | "window_washing";

const comboServiceTypes = {
  "bi-weekly-royal-duo": ["lawncare", "laundry"],
  "crown-estate-trio": ["lawncare", "laundry", "window_washing"],
  "crown-estate-trio-deluxe": ["lawncare", "laundry", "window_washing"],
  "monthly-castle-care": ["lawncare", "window_washing"],
  "royal-linen-panes-duo": ["laundry", "window_washing"],
} as const satisfies Record<string, readonly CheckoutServiceType[]>;

export const getComboServiceTypes = (planId: string) => {
  const combo = Object.entries(comboServiceTypes).find(
    ([prefix]) => planId === prefix || planId.startsWith(`${prefix}-`)
  );
  return combo?.[1] ?? null;
};

const recurringPlanPrefixes = [
  "groundskeeper-bi-weekly",
  "groundskeeper-monthly",
  "royal-pane-bi-annual",
  "royal-pane-monthly",
  "royal-wash-supreme",
] as const;

export const getComboPricingTier = (planId: string): PricingTier => {
  if (planId.endsWith("-large")) {
    return "large";
  }
  if (planId.endsWith("-medium")) {
    return "medium";
  }
  return "small";
};

export const isRecurringPlanId = (planId: string) =>
  getComboServiceTypes(planId) !== null ||
  recurringPlanPrefixes.some(
    (prefix) => planId === prefix || planId.startsWith(`${prefix}-`)
  );

export const isRecurringCheckoutItem = (item: CheckoutPreviewItemInput) =>
  item.isSubscription === true ||
  (typeof item.planId === "string" && isRecurringPlanId(item.planId));

const parsePlanPrice = (
  item: CheckoutPreviewItemInput
): {
  basePriceCents: number;
  label: string;
  comboServiceTypes?: readonly CheckoutServiceType[];
  pricingTier?: PricingTier;
  serviceType?: "combo" | CheckoutServiceType;
  serviceUnits?: ReturnType<typeof getRecurringServiceUnits>;
  windowWashingQuote?: ReturnType<typeof calculateWindowWashingQuote>;
} => {
  if (item.planId && item.planId in COMBO_SUBSCRIPTION_PRICES) {
    const planId = item.planId as keyof typeof COMBO_SUBSCRIPTION_PRICES;
    const comboLabels = {
      "bi-weekly-royal-duo-large": "Bi-Weekly Royal Duo Large",
      "bi-weekly-royal-duo-medium": "Bi-Weekly Royal Duo Medium",
      "bi-weekly-royal-duo-small": "Bi-Weekly Royal Duo Small",
      "crown-estate-trio-deluxe-large": "Crown Estate Trio Deluxe Large",
      "crown-estate-trio-deluxe-medium": "Crown Estate Trio Deluxe Medium",
      "crown-estate-trio-deluxe-small": "Crown Estate Trio Deluxe Small",
      "crown-estate-trio-large": "Crown Estate Trio Large",
      "crown-estate-trio-medium": "Crown Estate Trio Medium",
      "crown-estate-trio-small": "Crown Estate Trio Small",
      "monthly-castle-care-large": "Monthly CastleCare Large",
      "monthly-castle-care-medium": "Monthly CastleCare Medium",
      "monthly-castle-care-small": "Monthly CastleCare Small",
      "royal-linen-panes-duo": "Royal Linen & Panes Duo",
    } as const satisfies Record<keyof typeof COMBO_SUBSCRIPTION_PRICES, string>;

    return {
      basePriceCents: COMBO_SUBSCRIPTION_PRICES[planId],
      comboServiceTypes: getComboServiceTypes(planId) ?? undefined,
      label: comboLabels[planId],
      pricingTier: getComboPricingTier(planId),
      serviceType: "combo",
      serviceUnits: getRecurringServiceUnits(planId),
    };
  }

  if (item.itemKind === "window_washing") {
    if (
      item.planId === "royal-pane-monthly" ||
      item.planId === "royal-pane-bi-annual"
    ) {
      return {
        basePriceCents: WINDOW_WASHING_SUBSCRIPTION_PRICES[item.planId],
        label:
          item.planId === "royal-pane-bi-annual"
            ? "Royal Pane Bi-Annual Detail"
            : "Royal Pane Monthly",
        serviceType: "window_washing",
        serviceUnits: getRecurringServiceUnits(item.planId),
      };
    }

    const quote = calculateWindowWashingQuote({
      cleanScreens: item.cleanScreens ?? false,
      livingArea: item.livingArea ?? 1400,
      packageType: item.packageType ?? "EXTERIOR_ONLY",
      paneCount: item.paneCount,
      propertyType: item.propertyType ?? "residential",
      stories: item.stories ?? 1,
    });
    return {
      basePriceCents: quote.cents.finalPriceCents,
      label: `Window Washing - ${item.packageType === "FULL_SERVICE" ? "Inside & Out" : "Exterior Only"} (${quote.estimatedPanes} panes)`,
      serviceType: "window_washing",
      windowWashingQuote: quote,
    };
  }

  if (item.itemKind === "home_preorder") {
    return {
      basePriceCents: HOME_PREORDER_DEPOSIT_CENTS,
      label: item.homeConfiguration
        ? `CastleCare ${homeModels[item.homeConfiguration.model].name} — $5,000 preorder deposit`
        : "Home Project Deposit",
    };
  }

  if (!item.planId) {
    throw new Error(`planId is required for ${item.itemKind}`);
  }

  if (item.itemKind === "lawncare") {
    const lawncarePrice =
      LAWNCARE_PLAN_PRICES[item.planId as keyof typeof LAWNCARE_PLAN_PRICES];

    if (!lawncarePrice) {
      throw new Error(`Unknown lawncare plan id: ${item.planId}`);
    }

    const planId = item.planId as keyof typeof LAWNCARE_PLAN_PRICES;
    const pricingTier = getLawncarePricingTier(planId);

    return {
      basePriceCents: lawncarePrice,
      label: LAWNCARE_PLAN_LABELS[planId],
      pricingTier,
      serviceType: "lawncare",
      serviceUnits: getRecurringServiceUnits(item.planId),
    };
  }

  const laundryPrice =
    LAUNDRY_PLAN_PRICES[item.planId as keyof typeof LAUNDRY_PLAN_PRICES];

  if (!laundryPrice) {
    throw new Error(`Unknown laundry plan id: ${item.planId}`);
  }

  return {
    basePriceCents: laundryPrice,
    label: LAUNDRY_PLAN_LABELS[item.planId as keyof typeof LAUNDRY_PLAN_LABELS],
    serviceType: "laundry",
    serviceUnits: getRecurringServiceUnits(item.planId),
  };
};

const normalizeTiming = (
  inputTimingType: TimingType | undefined,
  scheduledStartAt: string | undefined
): TimingType => {
  if (inputTimingType) {
    return inputTimingType;
  }

  if (scheduledStartAt) {
    return "scheduled";
  }

  return "asap";
};

export interface ComputedCheckout {
  lineItems: CheckoutPreviewLineItem[];
  subtotalCents: number;
  technologyFeeCents: number;
  tipAmountCents: number;
  totalCents: number;
  travelFeeCents: number;
}

const getCheckoutLineItem = (
  item: CheckoutPreviewItemInput
): CheckoutPreviewLineItem => {
  const parsed = parsePlanPrice(item);
  const tipAmountCents = Math.max(0, item.tipAmountCents ?? 0);
  const quantity = 1;

  return {
    basePriceCents: parsed.basePriceCents,
    itemKind: item.itemKind,
    label: parsed.label,
    metadata: {
      comboServiceTypes: parsed.comboServiceTypes ?? null,
      homeConfiguration: item.homeConfiguration ?? null,
      homeQuoteId: item.homeQuoteId ?? null,
      homeTotalCents: item.homeConfiguration
        ? getHomePriceCents(item.homeConfiguration)
        : null,
      planId: item.planId ?? null,
      pricingTier: parsed.pricingTier ?? null,
      scheduledEndAt: item.scheduledEndAt ?? null,
      scheduledStartAt: item.scheduledStartAt ?? null,
      serviceDetails: item.serviceDetails ?? null,
      serviceType: parsed.serviceType ?? null,
      serviceUnits: parsed.serviceUnits ?? null,
      siteNotes: item.siteNotes ?? null,
      timingType: normalizeTiming(item.timingType, item.scheduledStartAt),
    },
    planId: item.planId,
    quantity,
    tipAmountCents,
    totalPriceCents: parsed.basePriceCents * quantity + tipAmountCents,
  };
};

const getResolvedTravel = (input: CheckoutPreviewRequest) =>
  calculateTravelFeeCents({
    distanceMiles: input.travelDistanceMiles,
    stateCode: input.travelStateCode,
  });

export const computeCheckoutPreview = (
  input: CheckoutPreviewRequest
): ComputedCheckout => {
  const lineItems = input.items.map(getCheckoutLineItem);
  const subtotalCents = lineItems.reduce(
    (sum, item) => sum + item.basePriceCents * item.quantity,
    0
  );
  const homesOnly =
    input.items.length > 0 &&
    input.items.every((item) => item.itemKind === "home_preorder");
  const technologyFeeCents = homesOnly ? 0 : TECHNOLOGY_FEE_CENTS;
  if (technologyFeeCents > 0) {
    lineItems.push({
      basePriceCents: technologyFeeCents,
      itemKind: "lawncare",
      label: "Technology fee",
      metadata: { serviceType: "fee" },
      planId: "technology-fee",
      quantity: 1,
      tipAmountCents: 0,
      totalPriceCents: technologyFeeCents,
    });
  }

  const resolvedTravel = getResolvedTravel(input);
  const travelFeeCents = homesOnly ? 0 : resolvedTravel.feeCents;
  if (travelFeeCents > 0) {
    lineItems.push({
      basePriceCents: travelFeeCents,
      itemKind: "lawncare",
      label:
        resolvedTravel.feeKind === "out_of_state"
          ? "Travel fee (out of state)"
          : "Travel fee (in state)",
      metadata: {
        distanceMiles: input.travelDistanceMiles ?? null,
        feeKind: resolvedTravel.feeKind,
        serviceType: "fee",
      },
      planId:
        resolvedTravel.feeKind === "out_of_state"
          ? "travel-fee-out-of-state"
          : "travel-fee-in-state",
      quantity: 1,
      tipAmountCents: 0,
      totalPriceCents: travelFeeCents,
    });
  }

  const tipAmountCents = Math.max(
    0,
    input.tipAmountCents ??
      lineItems.reduce((sum, item) => sum + item.tipAmountCents, 0)
  );
  const hasItemTip = input.items.some((item) => item.tipAmountCents);
  if (tipAmountCents > 0 && !hasItemTip) {
    lineItems.push({
      basePriceCents: 0,
      itemKind: "lawncare",
      label: "Tip",
      metadata: { serviceType: "tip" },
      planId: "tip",
      quantity: 1,
      tipAmountCents,
      totalPriceCents: tipAmountCents,
    });
  }

  const totalCents =
    subtotalCents + technologyFeeCents + travelFeeCents + tipAmountCents;

  return {
    lineItems,
    subtotalCents,
    technologyFeeCents,
    tipAmountCents,
    totalCents,
    travelFeeCents,
  };
};

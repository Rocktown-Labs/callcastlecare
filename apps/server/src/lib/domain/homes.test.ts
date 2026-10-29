import {
  getHomePriceCents,
  homeConfigurationSchema,
} from "@callcastlecare/api/homes";
import { describe, expect, it } from "vitest";

import { checkoutConfirmRequestSchema } from "../../routes/schemas";
import { computeCheckoutPreview } from "./checkout";

const configuration = {
  emptyContainer: true,
  exteriorColor: "blue",
  model: "residential",
} as const;

describe("Homes pricing and validation", () => {
  it.each([
    ["residential", 4_000_000],
    ["commercial", 6_500_000],
    ["multi-unit", 8_500_000],
  ] as const)(
    "prices %s with every finish and add-on in cents",
    (model, basePrice) => {
      for (const [exteriorColor, colorPrice] of [
        ["white", 0],
        ["earth", 50_000],
        ["slate", 50_000],
        ["blue", 70_000],
      ] as const) {
        expect(
          getHomePriceCents({ emptyContainer: false, exteriorColor, model })
        ).toBe(basePrice + colorPrice);
        expect(
          getHomePriceCents({ emptyContainer: true, exteriorColor, model })
        ).toBe(basePrice + colorPrice + 800_000);
      }
    }
  );
  it("charges exactly the home deposit without service fees", () => {
    const preview = computeCheckoutPreview({
      items: [{ homeConfiguration: configuration, itemKind: "home_preorder" }],
      travelDistanceMiles: 300,
      travelStateCode: "AR",
    });
    expect(preview.totalCents).toBe(500_000);
    expect(preview.lineItems).toHaveLength(1);
    expect(preview.technologyFeeCents).toBe(0);
    expect(preview.travelFeeCents).toBe(0);
    expect(preview.lineItems[0]?.metadata).toMatchObject({
      homeConfiguration: configuration,
      homeTotalCents: 4_870_000,
    });
  });
  it.each([
    { ...configuration, model: "unknown" },
    { ...configuration, exteriorColor: "purple" },
    { ...configuration, emptyContainer: "yes" },
  ])("rejects invalid configurations", (input) => {
    expect(homeConfigurationSchema.safeParse(input).success).toBe(false);
  });
  const request = {
    address: "123 Main St, Little Rock, AR",
    contact: {
      email: "test@example.com",
      name: "Test Customer",
      phone: "5015550100",
    },
    paymentOption: "pay_full",
  };
  it("requires a home configuration", () => {
    expect(
      checkoutConfirmRequestSchema.safeParse({
        ...request,
        items: [{ itemKind: "home_preorder" }],
      }).success
    ).toBe(false);
  });
  it.each([
    { planId: "royal-wash-small" },
    { homeQuoteId: 42 },
    { tipAmountCents: 100 },
    { isSubscription: true },
  ])(
    "rejects fields that could change the deposit or reference another customer's quote",
    (extra) => {
      expect(
        checkoutConfirmRequestSchema.safeParse({
          ...request,
          items: [
            {
              homeConfiguration: configuration,
              itemKind: "home_preorder",
              ...extra,
            },
          ],
        }).success
      ).toBe(false);
    }
  );
  it("accepts a complete guest preorder request", () => {
    expect(
      checkoutConfirmRequestSchema.safeParse({
        ...request,
        items: [
          { homeConfiguration: configuration, itemKind: "home_preorder" },
        ],
      }).success
    ).toBe(true);
  });
});

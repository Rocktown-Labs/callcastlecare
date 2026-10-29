import { z } from "zod";

export const homeModels = {
  commercial: {
    description: "Versatile commercial space for small businesses",
    name: "Commercial",
    priceCents: 6_500_000,
  },
  "multi-unit": {
    description: "Efficient multi-family living spaces",
    name: "Multi-Unit",
    priceCents: 8_500_000,
  },
  residential: {
    description: "Our signature 1 bed, 1 bath residential unit",
    name: "Residential",
    priceCents: 4_000_000,
  },
} as const;

export const homeExteriorColors = {
  blue: { name: "Colonial Blue", priceCents: 70_000, swatch: "#496e8a" },
  earth: { name: "Earth Tone", priceCents: 50_000, swatch: "#a08c72" },
  slate: { name: "Modern Slate", priceCents: 50_000, swatch: "#52606b" },
  white: { name: "Standard White", priceCents: 0, swatch: "#e8e6df" },
} as const;

export const EMPTY_CONTAINER_PRICE_CENTS = 800_000;
export const homeConfigurationSchema = z.object({
  emptyContainer: z.boolean(),
  exteriorColor: z.enum(["white", "earth", "slate", "blue"]),
  model: z.enum(["residential", "commercial", "multi-unit"]),
});
export type HomeConfiguration = z.infer<typeof homeConfigurationSchema>;

export const getHomePriceCents = (configuration: HomeConfiguration) =>
  homeModels[configuration.model].priceCents +
  homeExteriorColors[configuration.exteriorColor].priceCents +
  (configuration.emptyContainer ? EMPTY_CONTAINER_PRICE_CENTS : 0);

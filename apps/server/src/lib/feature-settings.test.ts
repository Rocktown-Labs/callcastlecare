import { beforeEach, describe, expect, it, vi } from "vitest";

import { getFeatureSettings } from "./feature-settings";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@callcastlecare/db", () => ({
  db: { query: { featureSettings: { findFirst: mocks.findFirst } } },
}));

describe("Homes feature settings", () => {
  beforeEach(() => vi.clearAllMocks());
  it("defaults on before an admin saves a setting", async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect(await getFeatureSettings()).toEqual({ homesEnabled: true });
  });
  it("preserves an explicit off setting", async () => {
    mocks.findFirst.mockResolvedValue({ homesEnabled: false });
    expect(await getFeatureSettings()).toEqual({ homesEnabled: false });
  });
  it("does not reopen Homes if the database is unavailable", async () => {
    mocks.findFirst.mockRejectedValue(new Error("Database unavailable"));
    await expect(getFeatureSettings()).rejects.toThrow("Database unavailable");
  });
});

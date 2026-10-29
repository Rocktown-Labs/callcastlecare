import { queryOptions, useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { getServerUrl } from "./server-url";

export const featureSettingsSchema = z.object({ homesEnabled: z.boolean() });
export const featureSettingsOptions = queryOptions({
  queryFn: async () => {
    const response = await fetch(new URL("/api/v1/features", getServerUrl()), {
      cache: "no-store",
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error("Feature settings could not be loaded.");
    }
    return featureSettingsSchema.parse(await response.json());
  },
  queryKey: ["feature-settings"],
  refetchInterval: 30_000,
  staleTime: 0,
});

export const useFeatureSettings = () => useQuery(featureSettingsOptions);

import { db } from "@callcastlecare/db";
import { featureSettings } from "@callcastlecare/db/schema/index";

export const getFeatureSettings = async () => {
  const row = await db.query.featureSettings.findFirst();
  return { homesEnabled: row?.homesEnabled ?? true };
};

export const updateFeatureSettings = async (homesEnabled: boolean) => {
  await db
    .insert(featureSettings)
    .values({ homesEnabled, id: 1 })
    .onConflictDoUpdate({
      set: { homesEnabled, updatedAt: new Date() },
      target: featureSettings.id,
    });
  return { homesEnabled };
};

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { createRequestLogger } from "evlog";
import { jsonContent } from "stoker/openapi/helpers";

import { requireAdmin } from "../lib/admin";
import {
  getFeatureSettings,
  updateFeatureSettings,
} from "../lib/feature-settings";
import type { AppEnv } from "../types";

const settingsSchema = z.object({ homesEnabled: z.boolean() });
const errorSchema = z.object({ error: z.string() });

export const featureRoutes = new OpenAPIHono<AppEnv>({
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json({ error: "Invalid feature settings" }, 400);
    }
  },
});

featureRoutes.openapi(
  createRoute({
    method: "get",
    path: "/",
    responses: {
      200: jsonContent(settingsSchema, "Public feature availability"),
    },
    tags: ["Features"],
  }),
  async (c) => {
    c.header("Cache-Control", "no-store");
    return c.json(await getFeatureSettings(), 200);
  }
);

featureRoutes.use("/", async (c, next) => {
  if (c.req.method !== "PUT") {
    return await next();
  }
  const denied = requireAdmin(c);
  if (denied) {
    return denied;
  }
  return await next();
});

featureRoutes.openapi(
  createRoute({
    method: "put",
    path: "/",
    request: {
      body: {
        content: { "application/json": { schema: settingsSchema } },
        required: true,
      },
    },
    responses: {
      200: jsonContent(settingsSchema, "Feature settings saved"),
      400: jsonContent(errorSchema, "Invalid settings"),
      401: jsonContent(errorSchema, "Authentication required"),
      403: jsonContent(errorSchema, "Admin required"),
    },
    tags: ["Features"],
  }),
  async (c) => {
    const settings = await updateFeatureSettings(
      c.req.valid("json").homesEnabled
    );
    const log = createRequestLogger({
      requestId: c.get("requestId"),
    });
    log.set({
      action: "admin:homes_feature_updated",
      adminId: c.get("user")?.id,
      homesEnabled: settings.homesEnabled,
    });
    log.emit();
    return c.json(settings, 200);
  }
);

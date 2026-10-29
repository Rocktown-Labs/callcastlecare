import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../types";
import { mediaRoutes } from "./media";

const mocks = vi.hoisted(() => ({
  customerFindFirst: vi.fn(),
  orderFindFirst: vi.fn(),
  put: vi.fn(),
  requireWorkerForUser: vi.fn(),
  serviceLegFindFirst: vi.fn(),
}));

vi.mock("@callcastlecare/db", () => ({
  and: vi.fn(),
  db: {
    insert: vi.fn(),
    query: {
      customers: { findFirst: mocks.customerFindFirst },
      orders: { findFirst: mocks.orderFindFirst },
      serviceLegs: { findFirst: mocks.serviceLegFindFirst },
    },
  },
  eq: vi.fn(),
  inArray: vi.fn(),
}));

vi.mock("@callcastlecare/db/schema/index", () => ({
  customers: { id: "id", userId: "userId" },
  legMediaLinks: { legId: "legId", mediaAssetId: "mediaAssetId" },
  mediaAssets: { id: "id", storagePath: "storagePath" },
  orderMediaLinks: { mediaAssetId: "mediaAssetId", orderId: "orderId" },
  orders: {
    assignedWorkerId: "assignedWorkerId",
    customerId: "customerId",
    id: "id",
  },
  serviceLegs: { id: "id", orderId: "orderId", workerId: "workerId" },
  workers: { id: "id", userId: "userId" },
}));

vi.mock("@callcastlecare/env/server", () => ({
  env: {
    ADMIN_EMAIL: "admin@callcastlecare.com",
    BETTER_AUTH_URL: "http://localhost:3000",
  },
}));

vi.mock("../lib/admin", () => ({
  isAdminUser: (user: { role?: string | null } | null) =>
    user?.role === "admin",
}));

vi.mock("../lib/auth", () => ({
  requireUser: (c: {
    get: (key: string) => unknown;
    json: (body: unknown, status: 401) => Response;
  }) => {
    const user = c.get("user");
    return user
      ? { error: null, user }
      : { error: c.json({ error: "unauthorized" }, 401), user: null };
  },
  requireWorkerForUser: mocks.requireWorkerForUser,
}));

vi.mock("../lib/integrations/blob", () => ({
  createMediaStoragePath: vi.fn(),
  getMediaUploadUrl: vi.fn(),
  mediaValidation: {
    allowedContentTypes: ["image/jpeg"],
    maxUploadSizeBytes: 1024,
    pathnamePrefix: "callcastlecare-media/",
  },
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));

const app = new Hono<AppEnv>()
  .use("*", async (c, next) => {
    const userHeader = c.req.header("x-test-user");
    c.set(
      "user",
      userHeader
        ? {
            email: "customer@example.com",
            id: userHeader,
            name: "Customer",
            role: "user",
          }
        : null
    );
    return await next();
  })
  .route("/media", mediaRoutes);

const bucket = { put: mocks.put };
const env = { MEDIA_BUCKET: bucket };

const buildForm = (storagePath: string) => {
  const form = new FormData();
  form.set("storagePath", storagePath);
  form.set("file", new File(["image"], "photo.jpg", { type: "image/jpeg" }));
  return form;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireWorkerForUser.mockResolvedValue(null);
  mocks.customerFindFirst.mockResolvedValue({ id: 1 });
  mocks.put.mockResolvedValue({});
});

describe("media client upload authorization", () => {
  it("rejects unauthenticated uploads", async () => {
    const response = await app.request(
      "/media/client-upload",
      {
        body: buildForm(
          "callcastlecare-media/order-12/leg-none/service_before/123-abc.jpg"
        ),
        method: "POST",
      },
      env
    );

    expect(response.status).toBe(401);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("rejects a storage path for another customer's order", async () => {
    mocks.orderFindFirst.mockResolvedValue({ customerId: 2, id: 12 });

    const response = await app.request(
      "/media/client-upload",
      {
        body: buildForm(
          "callcastlecare-media/order-12/leg-none/service_before/123-abc.jpg"
        ),
        headers: { "x-test-user": "user_1" },
        method: "POST",
      },
      env
    );

    expect(response.status).toBe(403);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("accepts an upload for the customer's own order", async () => {
    mocks.orderFindFirst.mockResolvedValue({ customerId: 1, id: 12 });

    const response = await app.request(
      "/media/client-upload",
      {
        body: buildForm(
          "callcastlecare-media/order-12/leg-none/service_before/123-abc.jpg"
        ),
        headers: { "x-test-user": "user_1" },
        method: "POST",
      },
      env
    );

    expect(response.status).toBe(200);
    expect(mocks.put).toHaveBeenCalledWith(
      "callcastlecare-media/order-12/leg-none/service_before/123-abc.jpg",
      expect.any(File),
      { httpMetadata: { contentType: "image/jpeg" } }
    );
  });

  it("rejects attaching media to another customer's order", async () => {
    mocks.orderFindFirst.mockResolvedValue({ customerId: 2, id: 12 });

    const response = await app.request(
      "/media/attach",
      {
        body: JSON.stringify({
          mediaType: "service_before",
          orderId: 12,
          storagePath:
            "callcastlecare-media/order-12/leg-none/service_before/123-abc.jpg",
        }),
        headers: {
          "Content-Type": "application/json",
          "x-test-user": "user_1",
        },
        method: "POST",
      },
      env
    );

    expect(response.status).toBe(403);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("rejects paths that do not match the issued media layout", async () => {
    const response = await app.request(
      "/media/client-upload",
      {
        body: buildForm("callcastlecare-media/../../etc/passwd"),
        headers: { "x-test-user": "user_1" },
        method: "POST",
      },
      env
    );

    expect(response.status).toBe(400);
    expect(mocks.put).not.toHaveBeenCalled();
  });
});

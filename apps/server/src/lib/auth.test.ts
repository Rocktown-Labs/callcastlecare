import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authCreateUser: vi.fn(),
  customerFindFirst: vi.fn(),
  dbInsert: vi.fn(),
  logger: { info: vi.fn() },
  userFindFirst: vi.fn(),
}));

vi.mock("@callcastlecare/auth", () => ({
  auth: {
    $context: Promise.resolve({
      internalAdapter: { createUser: mocks.authCreateUser },
    }),
  },
}));

vi.mock("@callcastlecare/db", () => ({
  db: {
    insert: mocks.dbInsert,
    query: {
      customers: { findFirst: mocks.customerFindFirst },
      user: { findFirst: mocks.userFindFirst },
    },
  },
  eq: vi.fn(),
}));

vi.mock("@callcastlecare/db/schema/index", () => ({
  customers: { email: "customer_email" },
  user: { email: "user_email" },
  workers: { userId: "worker_user_id" },
}));

vi.mock("./logger", () => ({ logger: mocks.logger }));

const { getOrCreateCustomerForCheckoutContact, toPublicSession, toPublicUser } =
  await import("./auth");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.customerFindFirst.mockResolvedValue(null);
  mocks.userFindFirst.mockResolvedValue(null);
  mocks.authCreateUser.mockResolvedValue({
    email: "customer@example.com",
    id: "user_checkout_1",
    name: "Taylor Customer",
  });
  mocks.dbInsert.mockReturnValue({
    values: vi.fn(() => ({
      returning: vi.fn().mockResolvedValue([
        {
          email: "customer@example.com",
          id: 42,
          userId: "user_checkout_1",
        },
      ]),
    })),
  });
});

describe("getOrCreateCustomerForCheckoutContact", () => {
  it("provisions the Better Auth identity through its internal adapter", async () => {
    const customer = await getOrCreateCustomerForCheckoutContact({
      email: " Customer@Example.com ",
      name: "Taylor Customer",
      phone: "5015550101",
    });

    expect(mocks.authCreateUser).toHaveBeenCalledWith({
      email: "customer@example.com",
      emailVerified: false,
      name: "Taylor Customer",
    });
    expect(mocks.dbInsert).toHaveBeenCalledTimes(1);
    expect(customer).toMatchObject({ id: 42, userId: "user_checkout_1" });
  });

  it("reuses an existing customer without provisioning another identity", async () => {
    const existingCustomer = {
      email: "customer@example.com",
      id: 42,
      userId: "user_existing",
    };
    mocks.customerFindFirst.mockResolvedValue(existingCustomer);

    const customer = await getOrCreateCustomerForCheckoutContact({
      email: "customer@example.com",
      name: "Taylor Customer",
      phone: "5015550101",
    });

    expect(customer).toBe(existingCustomer);
    expect(mocks.authCreateUser).not.toHaveBeenCalled();
    expect(mocks.dbInsert).not.toHaveBeenCalled();
  });
});

describe("public session serialization", () => {
  it("omits the bearer-equivalent session token", () => {
    const session = toPublicSession({
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      id: "session_1",
      impersonatedBy: null,
      userId: "user_1",
    });

    expect(session).toEqual({
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      id: "session_1",
      impersonatedBy: null,
      userId: "user_1",
    });
    expect("token" in session).toBe(false);
  });

  it("returns only display-safe user fields", () => {
    expect(
      toPublicUser({
        email: "customer@example.com",
        id: "user_1",
        image: null,
        name: "Taylor Customer",
        role: "user",
      })
    ).toEqual({
      email: "customer@example.com",
      id: "user_1",
      image: null,
      name: "Taylor Customer",
      role: "user",
    });
  });
});

// @vitest-environment jsdom
import type * as TanStackRouter from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CheckoutSuccessPage } from "./checkout.success";

const searchState: { session_id?: string; type?: string } = {};

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof TanStackRouter>(
    "@tanstack/react-router"
  );

  return {
    ...actual,
    Link: ({
      children,
      params,
      to,
      ...props
    }: AnchorHTMLAttributes<HTMLAnchorElement> & {
      children?: ReactNode;
      params?: Record<string, string>;
      to: string;
    }) => {
      let resolvedTo = to;
      if (params) {
        for (const [key, val] of Object.entries(params)) {
          resolvedTo = resolvedTo.replace(`$${key}`, val);
        }
      }
      return (
        <a href={resolvedTo} {...props}>
          {children}
        </a>
      );
    },
    useNavigate: () => vi.fn(),
    useSearch: () => searchState,
  };
});

vi.mock("@/components/home/marketing-layout", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("sonner", () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
  },
}));

describe("CheckoutSuccessPage", () => {
  beforeEach(() => {
    searchState.session_id = undefined;
    searchState.type = undefined;
    vi.restoreAllMocks();
  });

  it("shows an accessible customer confirmation and clear next actions", () => {
    render(<CheckoutSuccessPage />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Your CastleCare booking is confirmed.",
      })
    ).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "Payment received"
    );
    expect(screen.getByRole("list")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /get dashboard access/iu })
        .getAttribute("href")
    ).toBe("/claim-account");
    expect(
      screen
        .getByRole("link", { name: /open dashboard/iu })
        .getAttribute("href")
    ).toBe("/dashboard");
  });

  it("displays order number and dashboard button when authenticated", async () => {
    searchState.session_id = "cs_test_auth";
    const fakePayload = {
      address: "123 Camelot St, Avalon, CA 90210",
      appointmentWindow: "Tomorrow, 2:00 PM – 4:00 PM",
      customerEmail: "arthur@camelot.test",
      customerName: "Arthur Pendragon",
      isAuthenticated: true,
      orderId: 42,
      orderNumber: "Order #42",
      payment: {
        depositCents: 5000,
        isPaidInFull: false,
        paymentChoice: "Deposit paid today",
        totalCents: 12_000,
      },
      services: ["Lawn Care"],
      success: true,
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json(fakePayload)
    );

    render(<CheckoutSuccessPage />);

    expect(await screen.findByText("Order #42")).toBeTruthy();
    expect(screen.getByText("Signed in as arthur@camelot.test")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /view order in dashboard/iu })
        .getAttribute("href")
    ).toBe("/dashboard/orders/42");
    expect(screen.getByText("Tomorrow, 2:00 PM – 4:00 PM")).toBeTruthy();
    expect(screen.getByText("123 Camelot St, Avalon, CA 90210")).toBeTruthy();
  });

  it("displays order number and inline sign-in code option when unauthenticated", async () => {
    searchState.session_id = "cs_test_unauth";
    const fakePayload = {
      address: "456 Rose Lane, Camelot, CA 90210",
      appointmentWindow: "Wednesday, 10:00 AM – 12:00 PM",
      customerEmail: "gwen@camelot.test",
      customerName: "Gwen Pendragon",
      isAuthenticated: false,
      orderId: 43,
      orderNumber: "Order #43",
      payment: {
        depositCents: 5000,
        isPaidInFull: true,
        paymentChoice: "Paid in full",
        totalCents: 5000,
      },
      services: ["Laundry"],
      success: true,
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json(fakePayload)
    );

    render(<CheckoutSuccessPage />);

    expect(await screen.findByText("Order #43")).toBeTruthy();
    expect(
      screen.getByText("Connect your booking & track status")
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /email me a sign-in code/iu })
    ).toBeTruthy();
  });

  it("shows provider flow steps when type is provider", () => {
    searchState.type = "provider";

    render(<CheckoutSuccessPage />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Your provider setup is ready for the next step.",
      })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /verify email & continue/iu })
    ).toBeTruthy();
  });
  it("shows a Homes deposit receipt with the remaining home balance", async () => {
    searchState.type = "homes";
    searchState.session_id = "cs_home_test";
    localStorage.setItem("castlecare-homes-cart-v1", "saved-configuration");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({
        appointmentWindow: "Delivery confirmed after project review",
        checkoutKind: "homes",
        payment: {
          depositCents: 500_000,
          isPaidInFull: false,
          totalCents: 4_870_000,
        },
        services: ["CastleCare Residential"],
      })
    );
    render(<CheckoutSuccessPage />);
    expect(await screen.findByText("Preorder Summary")).toBeTruthy();
    expect(localStorage.getItem("castlecare-homes-cart-v1")).toBeNull();
    expect(screen.getByText("$5,000.00 deposit paid")).toBeTruthy();
    expect(screen.getByText(/43,700.00 home balance/u)).toBeTruthy();
    expect(
      screen.getByText("Delivery confirmed after project review")
    ).toBeTruthy();
  });
  it("does not confirm a Homes deposit before Stripe verification", () => {
    searchState.type = "homes";
    render(<CheckoutSuccessPage />);
    expect(screen.getByText("Verifying payment")).toBeTruthy();
    expect(
      screen.queryByText("Your CastleCare Homes deposit is received.")
    ).toBeNull();
  });
});

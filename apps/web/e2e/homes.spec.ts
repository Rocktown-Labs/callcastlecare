import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/get-session**", (route) =>
    route.fulfill({ json: null })
  );
  await page.route("**/api/v1/features", (route) =>
    route.fulfill({ json: { homesEnabled: true } })
  );
});

test("Homes redirects to the section, configures a cart, persists it, and starts Stripe checkout", async ({
  page,
}) => {
  await page.goto("/homes");
  await expect(page).toHaveURL(/\/#homes$/u);
  const section = page.locator("#homes");
  await expect(
    section.getByRole("heading", { name: "A space to call your own." })
  ).toBeVisible();
  await section.getByText("Commercial", { exact: true }).click();
  await section.getByText("Colonial Blue", { exact: true }).click();
  await section.getByRole("switch", { name: "Empty Container" }).click();
  await expect(section.getByText("$73,700", { exact: true })).toBeVisible();
  await section.getByRole("button", { name: "Add preorder to cart" }).click();
  await expect(section.getByText("$68,700", { exact: true })).toBeVisible();
  await page.reload();
  await section.getByRole("button", { name: "Continue to checkout" }).click();
  await section
    .getByRole("button", { name: "Pay $5,000 deposit with Stripe" })
    .click();
  await expect(section.getByText("Enter your full name.")).toBeVisible();
  await section.getByLabel("Full name").fill("Test Customer");
  await section.getByLabel("Email", { exact: true }).fill("test@example.com");
  await section.getByLabel("Phone", { exact: true }).fill("5015550100");
  await section
    .getByLabel("Site address")
    .fill("123 Main St, Little Rock, AR 72201");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  await section.screenshot({
    path: `/private/tmp/castlecare-homes-${String(test.info().project.name)}.png`,
  });
  await page.route("**/api/v1/checkout/confirm", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      items: [
        {
          homeConfiguration: {
            emptyContainer: true,
            exteriorColor: "blue",
            model: "commercial",
          },
          itemKind: "home_preorder",
        },
      ],
      paymentOption: "pay_full",
    });
    await route.fulfill({
      json: { checkoutUrl: "https://checkout.stripe.com/c/pay/homes-test" },
    });
  });
  await page.route("https://checkout.stripe.com/**", (route) =>
    route.fulfill({
      body: "<h1>Stripe checkout</h1>",
      contentType: "text/html",
    })
  );
  await section
    .getByRole("button", { name: "Pay $5,000 deposit with Stripe" })
    .click();
  await expect(page).toHaveURL("https://checkout.stripe.com/c/pay/homes-test");
});

test("disabled Homes hides the section and navigation", async ({ page }) => {
  await page.route("**/api/v1/features", (route) =>
    route.fulfill({ json: { homesEnabled: false } })
  );
  await page.goto("/homes");
  await expect(page).toHaveURL(/\/#homes$/u);
  await expect(
    page.getByRole("heading", { name: "A space to call your own." })
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { exact: true, name: "Homes" })
  ).toHaveCount(0);
});

test("the cart displays checkout errors and allows removal", async ({
  page,
}) => {
  await page.goto("/#homes");
  await page.getByRole("button", { name: "Add preorder to cart" }).click();
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await page.getByLabel("Full name").fill("Test Customer");
  await page.getByLabel("Email", { exact: true }).fill("test@example.com");
  await page.getByLabel("Phone", { exact: true }).fill("5015550100");
  await page
    .getByLabel("Site address")
    .fill("123 Main St, Little Rock, AR 72201");
  await page.route("**/api/v1/checkout/confirm", (route) =>
    route.fulfill({
      json: { error: "CastleCare Homes is currently unavailable." },
      status: 409,
    })
  );
  await page
    .getByRole("button", { name: "Pay $5,000 deposit with Stripe" })
    .click();
  await expect(page.getByRole("alert")).toHaveText(
    "CastleCare Homes is currently unavailable."
  );
  await page.getByRole("button", { name: "Remove home" }).click();
  await expect(page.getByText("Your Homes cart")).toHaveCount(0);
});

test("admins can turn Homes off and keep it off after reload", async ({
  page,
}) => {
  let homesEnabled = true;
  await page.route("**/api/auth/get-session**", (route) =>
    route.fulfill({
      json: {
        session: {
          expiresAt: "2099-01-01T00:00:00Z",
          id: "test-session",
          userId: "admin",
        },
        user: {
          email: "admin@example.com",
          id: "admin",
          name: "Admin",
          role: "admin",
        },
      },
    })
  );
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: { isAdmin: true, user: { email: "admin@example.com" } },
    })
  );
  await page.route("**/api/v1/me/profile", (route) =>
    route.fulfill({
      json: {
        customer: {
          email: "admin@example.com",
          firstName: "Admin",
          lastName: "Test",
        },
      },
    })
  );
  await page.route("**/api/v1/admin/checkout/settings", (route) =>
    route.fulfill({ json: { allowCashCheckout: true } })
  );
  await page.route("**/api/v1/features", async (route) => {
    if (route.request().method() === "PUT") {
      ({ homesEnabled } = route.request().postDataJSON());
    }
    await route.fulfill({ json: { homesEnabled } });
  });
  await page.goto("/admin/settings");
  const toggle = page.getByRole("switch", {
    exact: true,
    name: "CastleCare Homes",
  });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await page.reload();
  await expect(toggle).not.toBeChecked();
  await page.goto("/homes");
  await expect(
    page.getByRole("heading", { name: "A space to call your own." })
  ).toHaveCount(0);
});

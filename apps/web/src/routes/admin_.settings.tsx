import { Badge } from "@callcastlecare/ui/components/badge";
import { Button } from "@callcastlecare/ui/components/button";
import { Input } from "@callcastlecare/ui/components/input";
import { Label } from "@callcastlecare/ui/components/label";
import { Switch } from "@callcastlecare/ui/components/switch";
import {
  Link,
  createFileRoute,
  redirect,
  useBlocker,
  useRouteContext,
} from "@tanstack/react-router";
import {
  ArrowRight,
  Banknote,
  Save,
  Settings,
  ShieldCheck,
} from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/dashboard/app-shell";
import HomesFeatureToggle from "@/components/home/homes-feature-toggle";
import { authClient } from "@/lib/auth-client";
import { getServerUrl } from "@/lib/server-url";

interface SessionPayload {
  isAdmin?: boolean;
  user?: {
    email?: string;
  };
}

interface CustomerProfile {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
}

const getAdminSession = async () => {
  const response = await fetch(new URL("/api/v1/me", getServerUrl()), {
    credentials: "include",
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as SessionPayload;
};

const AdminSettingsRoute = () => {
  const { session } = useRouteContext({ from: "/admin_/settings" });
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
  });
  const [checkoutSettings, setCheckoutSettings] = useState<{
    allowCashCheckout: boolean;
  } | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const blocker = useBlocker({
    enableBeforeUnload: isDirty,
    shouldBlockFn: () => isDirty,
    withResolver: true,
  });

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      const response = await fetch(
        new URL("/api/v1/me/profile", getServerUrl()),
        {
          credentials: "include",
        }
      );

      if (!(active && response.ok)) {
        setIsLoading(false);
        return;
      }

      const payload = (await response.json()) as {
        customer?: CustomerProfile;
      };
      const { customer } = payload;
      setForm({
        firstName: customer?.firstName ?? "",
        lastName: customer?.lastName ?? "",
        phone: customer?.phone ?? "",
      });
      setIsLoading(false);
    };

    const runLoadProfile = async () => {
      try {
        await loadProfile();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Settings failed");
        setIsLoading(false);
      }
    };

    void runLoadProfile();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadCheckoutSettings = async () => {
      const response = await fetch(
        new URL("/api/v1/admin/checkout/settings", getServerUrl()),
        {
          credentials: "include",
        }
      );

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as {
        allowCashCheckout: boolean;
      };
      if (active) {
        setCheckoutSettings({
          allowCashCheckout: payload.allowCashCheckout,
        });
      }
    };

    void loadCheckoutSettings();

    return () => {
      active = false;
    };
  }, []);

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setIsDirty(true);
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);

    const response = await fetch(
      new URL("/api/v1/me/profile", getServerUrl()),
      {
        body: JSON.stringify(form),
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      }
    );

    setIsSaving(false);

    if (!response.ok) {
      toast.error("Admin settings could not be saved.");
      return;
    }

    setIsDirty(false);
    toast.success("Admin settings saved.");
  };

  const updateAllowCashCheckout = async (allowCashCheckout: boolean) => {
    const response = await fetch(
      new URL("/api/v1/admin/checkout/settings", getServerUrl()),
      {
        body: JSON.stringify({ allowCashCheckout }),
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      }
    );

    if (!response.ok) {
      toast.error("Checkout settings could not be saved.");
      return;
    }

    setCheckoutSettings({ allowCashCheckout });
    toast.success("Checkout settings saved.");
  };

  return (
    <AppShell isAdmin userEmail={session.user?.email ?? ""} variant="admin">
      <main className="px-4 py-6 text-slate-950 sm:py-10">
        <div className="mx-auto grid max-w-5xl gap-6">
          <section className="grid gap-3 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-lime-300 bg-lime-100 px-3 py-1 text-xs font-black uppercase text-lime-800">
              <Settings className="size-4" />
              Admin settings
            </div>
            <h1 className="text-3xl font-black tracking-tight md:text-5xl">
              Workspace settings
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-600">
              Keep your operator contact details ready while billing, catalog,
              and webhook controls stay in the routes built for them.
            </p>
          </section>

          {isLoading ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center font-bold text-slate-500">
              Loading settings...
            </div>
          ) : (
            <>
              <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
                {blocker.status === "blocked" ? (
                  <section className="rounded-3xl border border-slate-300 bg-white p-5 shadow-sm lg:col-span-2">
                    <h2 className="text-lg font-black">Unsaved changes</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Save your settings before leaving, or discard the edits
                      and continue.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Button
                        className="rounded-full border-slate-200"
                        onClick={() => blocker.reset()}
                        type="button"
                        variant="outline"
                      >
                        Stay here
                      </Button>
                      <Button
                        className="rounded-full bg-slate-950 text-white hover:bg-slate-800"
                        onClick={() => {
                          setIsDirty(false);
                          blocker.proceed();
                        }}
                        type="button"
                      >
                        Discard changes
                      </Button>
                    </div>
                  </section>
                ) : null}

                <form
                  className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                  onSubmit={(event) => void saveProfile(event)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <ShieldCheck className="size-5 text-lime-600" />
                    <h2 className="text-xl font-black">Admin contact</h2>
                    <Badge className="bg-lime-300 text-slate-950">Admin</Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {session.user?.email}
                  </p>
                  <div className="mt-5 grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="adminFirstName">First name</Label>
                      <Input
                        id="adminFirstName"
                        onChange={(event) =>
                          updateField("firstName", event.target.value)
                        }
                        value={form.firstName}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="adminLastName">Last name</Label>
                      <Input
                        id="adminLastName"
                        onChange={(event) =>
                          updateField("lastName", event.target.value)
                        }
                        value={form.lastName}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="adminPhone">Phone</Label>
                      <Input
                        id="adminPhone"
                        onChange={(event) =>
                          updateField("phone", event.target.value)
                        }
                        value={form.phone}
                      />
                    </div>
                  </div>
                  <Button
                    className="mt-5 rounded-full bg-lime-300 font-bold text-slate-950 hover:bg-lime-200"
                    disabled={isSaving}
                    type="submit"
                  >
                    <Save className="size-4" />
                    Save settings
                  </Button>
                </form>

                <section className="grid gap-4">
                  {[
                    {
                      body: "Update product cards, prices, coupons, and Stripe sync status.",
                      href: "/admin/catalog",
                      label: "Catalog controls",
                    },
                    {
                      body: "Review current work, field actions, notes, and media requirements.",
                      href: "/admin/orders",
                      label: "Order operations",
                    },
                    {
                      body: "Review provider applicants and future staff routing surfaces.",
                      href: "/admin/staff",
                      label: "Staff review",
                    },
                  ].map((item) => (
                    <Link
                      className="rounded-3xl border border-slate-200 bg-white p-5 text-slate-950 shadow-sm transition-colors hover:border-lime-300"
                      key={item.href}
                      to={item.href}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h2 className="text-lg font-black">{item.label}</h2>
                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            {item.body}
                          </p>
                        </div>
                        <ArrowRight className="mt-1 size-4 text-lime-700" />
                      </div>
                    </Link>
                  ))}
                </section>
              </div>

              <HomesFeatureToggle />
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-2">
                  <Banknote className="mt-0.5 size-5 text-lime-600" />
                  <div>
                    <h2 className="text-lg font-black">Checkout options</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                      Controls which payment choices appear on the booking
                      checkout step.
                    </p>
                  </div>
                </div>
                <div className="mt-5">
                  <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div>
                      <p className="text-sm font-bold text-slate-950">
                        Pay-in-cash checkout
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        Offer &quot;Deposit now, cash later&quot; as a payment
                        option at checkout.
                      </p>
                    </div>
                    {checkoutSettings === null ? (
                      <div className="h-6 w-10 animate-pulse rounded-full bg-slate-200" />
                    ) : (
                      <Switch
                        checked={checkoutSettings.allowCashCheckout}
                        onCheckedChange={(checked) =>
                          void updateAllowCashCheckout(checked)
                        }
                      />
                    )}
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </AppShell>
  );
};

export const Route = createFileRoute("/admin_/settings")({
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      throw redirect({
        search: { redirectTo: "/admin/settings" },
        to: "/sign-in",
      });
    }

    const adminSession = await getAdminSession();
    if (!adminSession?.isAdmin) {
      throw redirect({
        to: "/dashboard",
      });
    }

    return { session: adminSession };
  },
  component: AdminSettingsRoute,
  ssr: false,
});

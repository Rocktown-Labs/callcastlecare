import { HOME_PREORDER_DEPOSIT_CENTS } from "@callcastlecare/api";
import {
  EMPTY_CONTAINER_PRICE_CENTS,
  getHomePriceCents,
  homeConfigurationSchema,
  homeExteriorColors,
  homeModels,
} from "@callcastlecare/api/homes";
import type { HomeConfiguration } from "@callcastlecare/api/homes";
import { phoneSchema } from "@callcastlecare/api/validation";
import { Button } from "@callcastlecare/ui/components/button";
import { Input } from "@callcastlecare/ui/components/input";
import { Switch } from "@callcastlecare/ui/components/switch";
import { useForm } from "@tanstack/react-form";
import { House, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";

import { useFeatureSettings } from "@/lib/features";
import { homesCartStorageKey } from "@/lib/homes-cart";
import { getServerUrl } from "@/lib/server-url";

const modelOrder = ["residential", "commercial", "multi-unit"] as const;
const colorOrder = ["white", "earth", "slate", "blue"] as const;

const formatCents = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
const initialConfiguration: HomeConfiguration = {
  emptyContainer: false,
  exteriorColor: "white",
  model: "residential",
};
const contactSchema = z.object({
  address: z.string().trim().min(5, "Enter your site address."),
  email: z.email("Enter a valid email."),
  name: z.string().trim().min(2, "Enter your full name."),
  phone: phoneSchema,
});
const contactFields = [
  { autoComplete: "name", label: "Full name", name: "name", type: "text" },
  { autoComplete: "email", label: "Email", name: "email", type: "email" },
  { autoComplete: "tel", label: "Phone", name: "phone", type: "tel" },
  {
    autoComplete: "street-address",
    label: "Site address",
    name: "address",
    type: "text",
  },
] as const;

const HomeIllustration = ({
  configuration,
}: {
  configuration: HomeConfiguration;
}) => (
  <figure className="overflow-hidden rounded-3xl border border-white/10 bg-[#141d23]">
    <svg
      aria-label={`Concept illustration of the CastleCare ${homeModels[configuration.model].name} in ${homeExteriorColors[configuration.exteriorColor].name}`}
      // eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- SVG has no native alternative for its accessible image role.
      role="img"
      viewBox="0 0 640 420"
      className="w-full"
    >
      <title>Modular property concept</title>
      <path d="M0 335H640V420H0Z" fill="#263229" />
      <path d="M54 342 476 342 599 287 187 287Z" fill="#080c16" opacity=".5" />
      <path d="M90 163 452 163 552 115 191 115Z" fill="#6c7a73" />
      <path
        d="M452 163 552 115 552 303 452 349Z"
        fill={homeExteriorColors[configuration.exteriorColor].swatch}
        opacity=".65"
      />
      <path
        d="M90 163H452V349H90Z"
        fill={homeExteriorColors[configuration.exteriorColor].swatch}
      />
      {Array.from({ length: 19 }, (_, index) => (
        <path
          key={`rib-${String(index)}`}
          d={`M${102 + index * 18} 172V338`}
          stroke="#080c16"
          opacity=".15"
        />
      ))}
      <path
        d="M119 205H233V284H119Z M333 205H425V284H333Z"
        fill="#172d39"
        stroke="#d5e5d3"
        strokeWidth="5"
      />
      <path d="M176 205V284M379 205V284" stroke="#d5e5d3" strokeWidth="3" />
      <path
        d="M260 209H307V349H260Z"
        fill="#38493a"
        stroke="#d5e5d3"
        strokeWidth="4"
      />
      <circle cx="298" cy="283" r="3" fill="#bef264" />
      <path d="M77 349H467V360H77Z" fill="#a08c72" />
      <path
        d="M47 356V296M34 311 47 280 62 312M564 323V256M548 279 564 238 583 278"
        stroke="#71845c"
        strokeWidth="9"
      />
      {configuration.model === "multi-unit" ? (
        <path
          d="M190 115V73H552V115"
          fill="#718077"
          stroke="#a7b2a2"
          strokeWidth="4"
        />
      ) : null}
    </svg>
    <figcaption className="border-t border-white/10 px-5 py-4 text-xs leading-5 text-slate-400">
      Concept illustration. Floor plans, finishes, site preparation, delivery,
      and installation will be confirmed with CastleCare before production.
    </figcaption>
  </figure>
);

const HomesCheckout = ({
  configuration,
}: {
  configuration: HomeConfiguration;
}) => {
  const [checkoutError, setCheckoutError] = useState("");
  const form = useForm({
    defaultValues: { address: "", email: "", name: "", phone: "" },
    onSubmit: async ({ value }) => {
      setCheckoutError("");
      try {
        const { address, ...contact } = contactSchema.parse(value);
        const response = await fetch(
          new URL("/api/v1/checkout/confirm", getServerUrl()),
          {
            body: JSON.stringify({
              address,
              contact,
              items: [
                { homeConfiguration: configuration, itemKind: "home_preorder" },
              ],
              paymentOption: "pay_full",
            }),
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            method: "POST",
          }
        );
        const payload: unknown = await response.json();
        const result = z.object({ checkoutUrl: z.url() }).safeParse(payload);
        if (!response.ok || !result.success) {
          const failure = z.object({ error: z.string() }).safeParse(payload);
          throw new Error(
            failure.success
              ? failure.data.error
              : "Checkout could not be started. Check your details and try again."
          );
        }
        window.location.assign(result.data.checkoutUrl);
      } catch (error) {
        setCheckoutError(
          error instanceof Error
            ? error.message
            : "Checkout is unavailable. Please try again."
        );
      }
    },
    validators: { onSubmit: contactSchema },
  });
  return (
    <form
      className="mt-6 grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <h4 className="text-lg font-bold">Reserve your home</h4>
      <p className="text-sm text-slate-400">
        Currently accepting preorders for Arkansas sites.
      </p>
      {contactFields.map((input) => (
        <form.Field key={input.name} name={input.name}>
          {(field) => (
            <div className="grid gap-2">
              <label
                htmlFor={`homes-${input.name}`}
                className="text-sm font-medium"
              >
                {input.label}
              </label>
              <Input
                id={`homes-${input.name}`}
                className="h-11 rounded-xl border-white/20 text-base"
                autoComplete={input.autoComplete}
                type={input.type}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                aria-invalid={field.state.meta.errors.length > 0}
                aria-describedby={
                  field.state.meta.errors.length > 0
                    ? `homes-${input.name}-error`
                    : undefined
                }
              />
              {field.state.meta.errors.length > 0 ? (
                <p
                  id={`homes-${input.name}-error`}
                  className="text-sm text-red-300"
                  role="alert"
                >
                  {field.state.meta.errors
                    .map((issue) => issue?.message)
                    .join(" ")}
                </p>
              ) : null}
            </div>
          )}
        </form.Field>
      ))}
      <p className="text-xs leading-5 text-slate-400">
        Pay a $5,000 preorder deposit today, credited toward your configured
        home price. This does not book a service appointment or confirm a
        delivery date. CastleCare will contact you to finalize the project and
        remaining balance.
      </p>
      {checkoutError ? (
        <p role="alert" className="text-sm text-red-300">
          {checkoutError}
        </p>
      ) : null}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button
            className="h-12 rounded-full bg-lime-300 font-bold text-slate-950 hover:bg-lime-200"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? "Opening Stripe…"
              : "Pay $5,000 deposit with Stripe"}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
};

const readSavedCart = (): HomeConfiguration | null => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const saved = homeConfigurationSchema.safeParse(
      JSON.parse(localStorage.getItem(homesCartStorageKey) ?? "null")
    );
    return saved.success ? saved.data : null;
  } catch {
    return null;
  }
};

export const HomesConfigurator = () => {
  const [cart, setCart] = useState<HomeConfiguration | null>(readSavedCart);
  const [configuration, setConfiguration] = useState<HomeConfiguration>(
    () => cart ?? initialConfiguration
  );
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const updateCart = (next: HomeConfiguration | null) => {
    setCart(next);
    setCheckoutOpen(false);
    try {
      if (next) {
        localStorage.setItem(homesCartStorageKey, JSON.stringify(next));
      } else {
        localStorage.removeItem(homesCartStorageKey);
      }
    } catch {
      /* Cart state remains available in memory. */
    }
  };
  const property = homeModels[configuration.model];
  return (
    <section
      id="homes"
      aria-labelledby="homes-title"
      className="scroll-mt-20 border-t border-white/10 bg-[#0d141d] px-4 py-20 text-white sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 max-w-2xl">
          <p className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-lime-300">
            <House className="size-4" /> CastleCare Homes
          </p>
          <h2
            id="homes-title"
            className="text-4xl font-black tracking-tight sm:text-5xl"
          >
            A space to call your own.
          </h2>
          <p className="mt-5 text-lg leading-8 text-slate-400">
            Explore our modular homes and commercial spaces. Choose your model,
            make it yours, and reserve with a $5,000 deposit.
          </p>
        </div>
        <fieldset className="mb-8 grid max-w-lg grid-cols-3 gap-2">
          <legend className="sr-only">Property model</legend>
          {modelOrder.map((id) => (
            <label
              key={id}
              className={`cursor-pointer rounded-full border px-2 py-3 text-center text-xs font-bold sm:text-sm has-focus-visible:ring-2 has-focus-visible:ring-lime-300 ${configuration.model === id ? "border-lime-300 bg-lime-300 text-slate-950" : "border-white/15 text-slate-300"}`}
            >
              <input
                className="sr-only"
                type="radio"
                name="home-model"
                checked={configuration.model === id}
                onChange={() =>
                  setConfiguration((current) => ({
                    ...current,
                    model: homeConfigurationSchema.shape.model.parse(id),
                  }))
                }
              />
              {homeModels[id].name}
            </label>
          ))}
        </fieldset>
        <div className="grid items-start gap-8 lg:grid-cols-[1.1fr_1fr]">
          <HomeIllustration configuration={configuration} />
          <div className="rounded-3xl border border-white/15 bg-[#111c28] p-6 sm:p-8">
            <h3 className="text-2xl font-bold">CastleCare {property.name}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {property.description}
            </p>
            <p className="mt-5 text-4xl font-black" aria-live="polite">
              {formatCents(getHomePriceCents(configuration))}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Configured home price · site costs confirmed separately
            </p>
            <div className="my-7 flex items-center justify-between gap-4 border-y border-white/10 py-5">
              <div>
                <label htmlFor="empty-container" className="font-semibold">
                  Empty Container
                </label>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  Additional space for customization
                </p>
                <p className="mt-2 text-sm text-lime-300">
                  +{formatCents(EMPTY_CONTAINER_PRICE_CENTS)}
                </p>
              </div>
              <Switch
                className="data-checked:bg-lime-300"
                id="empty-container"
                checked={configuration.emptyContainer}
                onCheckedChange={(emptyContainer) =>
                  setConfiguration((current) => ({
                    ...current,
                    emptyContainer,
                  }))
                }
              />
            </div>
            <fieldset>
              <legend className="mb-3 text-sm font-bold">Exterior color</legend>
              <div className="grid grid-cols-2 gap-3">
                {colorOrder.map((id) => {
                  const color = homeExteriorColors[id];
                  return (
                    <label
                      aria-label={color.name}
                      key={id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 has-focus-visible:ring-2 has-focus-visible:ring-lime-300 ${configuration.exteriorColor === id ? "border-lime-300" : "border-white/15"}`}
                    >
                      <input
                        type="radio"
                        name="home-color"
                        className="accent-lime-300"
                        checked={configuration.exteriorColor === id}
                        onChange={() =>
                          setConfiguration((current) => ({
                            ...current,
                            exteriorColor:
                              homeConfigurationSchema.shape.exteriorColor.parse(
                                id
                              ),
                          }))
                        }
                      />
                      <span>
                        <span
                          className="mb-1 block size-4 rounded-full border border-white/30"
                          style={{ backgroundColor: color.swatch }}
                        />
                        <span className="block text-xs font-semibold">
                          {color.name}
                        </span>
                        <span className="text-xs text-slate-400">
                          {color.priceCents
                            ? `+${formatCents(color.priceCents)}`
                            : "Included"}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <Button
              className="mt-7 h-12 w-full rounded-full bg-lime-300 font-bold text-slate-950 hover:bg-lime-200"
              onClick={() => updateCart(configuration)}
            >
              <ShoppingBag className="size-4" />
              {cart ? "Update home in cart" : "Add preorder to cart"}
            </Button>
            {cart ? (
              <div
                className="mt-6 border-t border-white/15 pt-6"
                aria-live="polite"
              >
                <h4 className="font-bold">Your Homes cart</h4>
                <p className="mt-2 text-sm text-slate-300">
                  CastleCare {homeModels[cart.model].name} ·{" "}
                  {homeExteriorColors[cart.exteriorColor].name}
                  {cart.emptyContainer ? " · Empty Container" : ""}
                </p>
                <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
                  <dt>Configured total</dt>
                  <dd className="text-right">
                    {formatCents(getHomePriceCents(cart))}
                  </dd>
                  <dt>Deposit due today</dt>
                  <dd className="text-right font-bold text-lime-300">
                    {formatCents(HOME_PREORDER_DEPOSIT_CENTS)}
                  </dd>
                  <dt>Home balance after deposit</dt>
                  <dd className="text-right">
                    {formatCents(
                      getHomePriceCents(cart) - HOME_PREORDER_DEPOSIT_CENTS
                    )}
                  </dd>
                </dl>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button
                    className="rounded-full"
                    onClick={() => setCheckoutOpen(true)}
                  >
                    Continue to checkout
                  </Button>
                  <Button
                    variant="ghost"
                    className="rounded-full"
                    onClick={() => updateCart(null)}
                  >
                    Remove home
                  </Button>
                </div>
                {checkoutOpen ? <HomesCheckout configuration={cart} /> : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
};

export default function PropertiesSection() {
  const { data, isPending } = useFeatureSettings();
  useEffect(() => {
    if (data?.homesEnabled && window.location.hash === "#homes") {
      document.querySelector("#homes")?.scrollIntoView();
    }
  }, [data?.homesEnabled]);
  if (isPending) {
    return <div id="homes" className="scroll-mt-20" />;
  }
  return data?.homesEnabled ? <HomesConfigurator /> : null;
}

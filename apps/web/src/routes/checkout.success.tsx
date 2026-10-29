import { Button } from "@callcastlecare/ui/components/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@callcastlecare/ui/components/input-otp";
import { Spinner } from "@callcastlecare/ui/components/spinner";
import {
  createFileRoute,
  Link,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import {
  House,
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  Copy,
  Mail,
  MapPin,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserRoundCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import MarketingLayout from "@/components/home/marketing-layout";
import { signInWithEmailOtp } from "@/lib/auth/email-otp";
import { homesCartStorageKey } from "@/lib/homes-cart";
import { getServerUrl } from "@/lib/server-url";

const searchSchema = z.object({
  plan: z.string().optional(),
  session_id: z.string().optional(),
  type: z.string().optional(),
});

interface CheckoutOrderPayload {
  checkoutKind?: "homes";
  accessToken?: string;
  address?: string | null;
  appointmentWindow?: string | null;
  customerEmail?: string | null;
  isAuthenticated?: boolean;
  maskedEmail?: string | null;
  orderId?: number | null;
  orderNumber?: string | null;
  payment?: {
    depositCents: number;
    isPaidInFull: boolean;
    totalCents: number;
  } | null;
  services?: string[];
  success?: boolean;
}

const formatCents = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
  }).format(cents / 100);

const customerSteps = [
  {
    description:
      "Your selected 2-hour service window is attached to the booking.",
    icon: CalendarClock,
    title: "Your booking is secured",
  },
  {
    description:
      "We’ll send your receipt and service updates to the email used at checkout.",
    icon: ReceiptText,
    title: "Receipt & updates are next",
  },
  {
    description:
      "Use your checkout email to receive a one-time code and open your dashboard.",
    icon: UserRoundCheck,
    title: "Get dashboard access",
  },
] as const;

const providerSteps = [
  {
    description:
      "Your background and driving record checks are ready for review.",
    icon: ShieldCheck,
    title: "Screening is underway",
  },
  {
    description:
      "Check your inbox to confirm your email and finish account setup.",
    icon: Mail,
    title: "Verify your email",
  },
  {
    description:
      "After verification, continue to your provider dashboard and equipment checklist.",
    icon: ArrowRight,
    title: "Continue to Provider Hub",
  },
] as const;

const actionLinkClassName =
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950";

interface SuccessStepProps {
  description: string;
  icon: LucideIcon;
  index: number;
  title: string;
}

const SuccessStep = ({
  description,
  icon: Icon,
  index,
  title,
}: SuccessStepProps) => (
  <li className="rounded-2xl border border-white/10 bg-white/[0.045] p-5 shadow-sm">
    <div className="flex items-start gap-4">
      <div
        aria-hidden="true"
        className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-lime-300 text-slate-950"
      >
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-lime-300">
          Step {index}
        </p>
        <h2 className="mt-1 text-base font-bold text-white">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">{description}</p>
      </div>
    </div>
  </li>
);

const CheckoutOtpForm = ({
  claimAccountSearch,
  handleSendLoginCode,
  handleVerifyOtp,
  isSendingOtp,
  isVerifyingOtp,
  orderData,
  otp,
  otpError,
  otpSent,
  setOtp,
}: {
  claimAccountSearch: { accessToken?: string };
  handleSendLoginCode: () => void;
  handleVerifyOtp: () => void;
  isSendingOtp: boolean;
  isVerifyingOtp: boolean;
  orderData: CheckoutOrderPayload;
  otp: string;
  otpError: string | null;
  otpSent: boolean;
  setOtp: (value: string) => void;
}) => {
  if (otpSent) {
    return (
      <div className="space-y-4">
        <div>
          <label
            className="mb-2 block text-xs font-semibold text-slate-300"
            htmlFor="checkout-otp-input"
          >
            Enter the 6-digit code sent to{" "}
            {orderData.maskedEmail ?? orderData.customerEmail}:
          </label>
          <InputOTP
            containerClassName="justify-start"
            disabled={isVerifyingOtp}
            id="checkout-otp-input"
            maxLength={6}
            onChange={setOtp}
            value={otp}
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
            </InputOTPGroup>
            <InputOTPSeparator className="text-white/35 [&_svg]:size-4" />
            <InputOTPGroup>
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
          {otpError ? (
            <p className="mt-2 text-xs font-medium text-rose-400">{otpError}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <Button
            className="h-11 rounded-full bg-lime-300 px-6 font-bold text-slate-950 hover:bg-lime-200"
            disabled={isVerifyingOtp || otp.length !== 6}
            onClick={handleVerifyOtp}
            type="button"
          >
            {isVerifyingOtp && <Spinner />} Verify & open dashboard
          </Button>
          <Button
            className="h-10 rounded-full text-slate-300 hover:bg-white/10 hover:text-white"
            disabled={isSendingOtp || isVerifyingOtp}
            onClick={handleSendLoginCode}
            type="button"
            variant="ghost"
          >
            Resend code
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Button
        className="h-11 rounded-full bg-lime-300 px-6 font-bold text-slate-950 hover:bg-lime-200"
        disabled={isSendingOtp}
        onClick={handleSendLoginCode}
        type="button"
      >
        {isSendingOtp && <Spinner />} Email me a sign-in code
      </Button>
      <Link
        className="text-xs text-slate-400 underline underline-offset-4 hover:text-white"
        search={claimAccountSearch}
        to="/claim-account"
      >
        Or claim account / set password
      </Link>
    </div>
  );
};

const AccountConnectionCard = ({
  claimAccountSearch,
  handleSendLoginCode,
  handleVerifyOtp,
  isProviderFlow,
  isSendingOtp,
  isVerifyingOtp,
  orderData,
  otp,
  otpError,
  otpSent,
  setOtp,
  sessionId,
}: {
  claimAccountSearch: { accessToken?: string };
  handleSendLoginCode: () => void;
  handleVerifyOtp: () => void;
  isProviderFlow: boolean;
  isSendingOtp: boolean;
  isVerifyingOtp: boolean;
  orderData: CheckoutOrderPayload | null;
  otp: string;
  otpError: string | null;
  otpSent: boolean;
  setOtp: (value: string) => void;
  sessionId?: string;
}) => {
  if (isProviderFlow) {
    return null;
  }
  if (orderData === null) {
    return null;
  }

  if (orderData.isAuthenticated) {
    return (
      <div className="mt-8 rounded-2xl border border-lime-300/20 bg-lime-300/[0.06] p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-lime-300 text-slate-950"
            >
              <UserCheck className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Signed in as {orderData.customerEmail}
              </h3>
              <p className="text-sm text-slate-300">
                Your booking is linked directly to your customer account.
              </p>
            </div>
          </div>
          {orderData.orderId ? (
            <Link
              className={`${actionLinkClassName} bg-lime-300 text-slate-950 hover:bg-lime-200`}
              params={{ orderId: String(orderData.orderId) }}
              to="/dashboard/orders/$orderId"
            >
              View Order in Dashboard{" "}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          ) : (
            <Link
              className={`${actionLinkClassName} bg-lime-300 text-slate-950 hover:bg-lime-200`}
              to="/dashboard"
            >
              View Order in Dashboard{" "}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (sessionId === undefined || !orderData.customerEmail) {
    return null;
  }

  return (
    <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
      <div className="max-w-xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-lime-300/30 bg-lime-300/10 px-3 py-1 text-xs font-bold text-lime-300">
          <Sparkles aria-hidden="true" className="size-3.5" /> Instant Dashboard
          Access
        </div>
        <h3 className="mt-3 text-xl font-bold text-white">
          Connect your booking & track status
        </h3>
        <p className="mt-1.5 text-sm leading-6 text-slate-300">
          We created your customer account with this booking. Sign in with a
          secure one-time code sent to{" "}
          <span className="font-semibold text-white">
            {orderData.maskedEmail ?? orderData.customerEmail}
          </span>{" "}
          — no password needed.
        </p>
      </div>
      <div className="mt-6 max-w-md">
        <CheckoutOtpForm
          claimAccountSearch={claimAccountSearch}
          handleSendLoginCode={handleSendLoginCode}
          handleVerifyOtp={handleVerifyOtp}
          isSendingOtp={isSendingOtp}
          isVerifyingOtp={isVerifyingOtp}
          orderData={orderData}
          otp={otp}
          otpError={otpError}
          otpSent={otpSent}
          setOtp={setOtp}
        />
      </div>
    </div>
  );
};

const useCheckoutSuccessPayload = (input: {
  isProviderFlow: boolean;
  sessionId?: string;
}) => {
  const [checkoutAccessToken, setCheckoutAccessToken] = useState<string | null>(
    null
  );
  const [orderData, setOrderData] = useState<CheckoutOrderPayload | null>(null);

  useEffect(() => {
    const { sessionId } = input;
    if (input.isProviderFlow || sessionId === undefined) {
      return;
    }

    const controller = new AbortController();
    void (async () => {
      try {
        const url = new URL("/api/v1/checkout/access-token", getServerUrl());
        url.searchParams.set("session_id", sessionId);
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as CheckoutOrderPayload;
        if (payload.accessToken) {
          setCheckoutAccessToken(payload.accessToken);
        }
        setOrderData(payload);
        if (payload.checkoutKind === "homes") {
          localStorage.removeItem(homesCartStorageKey);
        }
      } catch {
        // The email form remains available as a safe fallback.
      }
    })();

    return () => controller.abort();
  }, [input.isProviderFlow, input.sessionId]);

  return { checkoutAccessToken, orderData };
};

const getPaymentSummary = (payment: CheckoutOrderPayload["payment"]) => {
  if (!payment) {
    return "$50.00 deposit paid";
  }
  if (payment.isPaidInFull) {
    return `${formatCents(payment.totalCents)} (Paid in full)`;
  }
  return `${formatCents(payment.depositCents)} deposit paid`;
};

const BookingSummary = ({
  isProviderFlow,
  orderData,
}: {
  isProviderFlow: boolean;
  orderData: CheckoutOrderPayload | null;
}) => {
  if (isProviderFlow || orderData === null) {
    return null;
  }
  const services = orderData.services ?? [];
  const hasBalance = orderData.payment?.isPaidInFull === false;

  return (
    <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
      <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-lime-300">
        {orderData.checkoutKind === "homes"
          ? "Preorder Summary"
          : "Booking Summary"}
      </h2>
      <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-400">Services</p>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {services.length > 0 ? (
              services.map((service) => (
                <span
                  className="inline-block rounded-md bg-white/10 px-2 py-0.5 text-xs font-medium text-white"
                  key={service}
                >
                  {service}
                </span>
              ))
            ) : (
              <p className="text-sm font-semibold text-white">
                CastleCare Service
              </p>
            )}
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-400">
            {orderData.checkoutKind === "homes"
              ? "Delivery"
              : "Appointment Window"}
          </p>
          <div className="flex items-start gap-2 pt-0.5">
            <CalendarClock
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-lime-300"
            />
            <p className="text-sm font-semibold text-white">
              {orderData.appointmentWindow ?? "2-hour appointment window"}
            </p>
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-400">Service Address</p>
          <div className="flex items-start gap-2 pt-0.5">
            <MapPin
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-lime-300"
            />
            <p className="line-clamp-2 text-sm font-semibold text-white">
              {orderData.address ?? "Address on file"}
            </p>
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-400">
            Payment Breakdown
          </p>
          <div className="pt-0.5">
            <p className="text-sm font-semibold text-white">
              {getPaymentSummary(orderData.payment)}
            </p>
            {hasBalance ? (
              <p className="mt-0.5 text-xs text-slate-400">
                {formatCents(
                  (orderData.payment?.totalCents ?? 0) -
                    (orderData.payment?.depositCents ?? 0)
                )}{" "}
                {orderData.checkoutKind === "homes"
                  ? "home balance, finalized with CastleCare"
                  : "balance due upon completion"}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

const getCheckoutPresentation = (
  type: string | undefined,
  email: string,
  hasVerifiedPayment: boolean
) => {
  if (type === "homes" && !hasVerifiedPayment) {
    return {
      description:
        "We’re checking your payment with Stripe. If your payment is still processing, keep your Stripe receipt and contact CastleCare before placing another preorder.",
      status: "Verifying payment",
      steps: [],
      title: "Checking your CastleCare Homes deposit.",
    };
  }
  if (type === "homes") {
    return {
      description:
        "Thank you for reserving a CastleCare home. Your deposit does not confirm a delivery date. We’ll contact you to finalize your project.",
      status: "Payment received",
      steps: [
        {
          description:
            "Your $5,000 deposit is credited toward the configured home price.",
          icon: House,
          title: "Your home deposit is recorded",
        },
        {
          description:
            "CastleCare will contact you to confirm plans, site costs, delivery, and the remaining balance.",
          icon: ReceiptText,
          title: "Finalize your project",
        },
        {
          description:
            "Your payment and selected configuration are saved with your preorder.",
          icon: ShieldCheck,
          title: "Keep your receipt",
        },
      ],
      title: "Your CastleCare Homes deposit is received.",
    };
  }
  if (type === "provider") {
    return {
      description:
        "Your $50 background check and MVR authorization payment was accepted. Verify your email to finish setting up your provider account.",
      status: "Authorization payment received",
      steps: providerSteps,
      title: "Your provider setup is ready for the next step.",
    };
  }
  return {
    description: `Your payment was accepted, and we’re preparing your service details. We’ve sent your confirmation receipt to ${email}.`,
    status: "Payment received",
    steps: customerSteps,
    title: "Your CastleCare booking is confirmed.",
  };
};

export const CheckoutSuccessPage = () => {
  const search = useSearch({ from: "/checkout/success" });
  const navigate = useNavigate();
  const isProviderFlow = search.type === "provider";
  const { checkoutAccessToken, orderData } = useCheckoutSuccessPayload({
    isProviderFlow,
    sessionId: search.session_id,
  });
  const [copiedOrder, setCopiedOrder] = useState(false);

  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  const claimAccountSearch = checkoutAccessToken
    ? { accessToken: checkoutAccessToken }
    : {};

  const handleProviderVerification = () => {
    void navigate({
      search: { redirectTo: "/dashboard/provider" },
      to: "/verify-email",
    });
  };

  const handleCopyOrder = async () => {
    const textToCopy =
      orderData?.orderNumber ??
      (orderData?.orderId ? `Order #${orderData.orderId}` : "");
    if (!textToCopy) {
      return;
    }
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedOrder(true);
      toast.success("Order number copied to clipboard");
      setTimeout(() => {
        setCopiedOrder(false);
      }, 2000);
    } catch {
      toast.info(`Order: ${textToCopy}`);
    }
  };

  const handleSendLoginCode = async () => {
    if (!search.session_id) {
      return;
    }
    setOtpError(null);
    setIsSendingOtp(true);
    try {
      const response = await fetch(
        new URL("/api/v1/checkout/send-login-code", getServerUrl()),
        {
          body: JSON.stringify({ sessionId: search.session_id }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }
      );
      const data = (await response.json()) as {
        error?: string;
        maskedEmail?: string;
        message?: string;
        success?: boolean;
      };
      if (!response.ok || !data.success) {
        throw new Error(
          data.message ?? data.error ?? "Failed to send sign-in code."
        );
      }
      setOtpSent(true);
      toast.success(
        `Sign-in code sent to ${data.maskedEmail ?? orderData?.customerEmail ?? "your email"}`
      );
    } catch (error) {
      setOtpError(
        error instanceof Error ? error.message : "Failed to send sign-in code."
      );
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!orderData?.customerEmail || otp.length !== 6) {
      return;
    }
    setOtpError(null);
    setIsVerifyingOtp(true);
    try {
      await signInWithEmailOtp({
        email: orderData.customerEmail,
        otp,
      });
      toast.success("Signed in successfully!");
      await navigate(
        orderData.orderId
          ? {
              params: { orderId: String(orderData.orderId) },
              to: "/dashboard/orders/$orderId",
            }
          : { to: "/dashboard" }
      );
    } catch (error) {
      setOtpError(
        error instanceof Error ? error.message : "Invalid or expired code."
      );
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const { steps, title, description, status } = getCheckoutPresentation(
    search.type,
    orderData?.maskedEmail ??
      orderData?.customerEmail ??
      "the email used at checkout",
    orderData !== null
  );

  return (
    <MarketingLayout>
      <section
        aria-labelledby="checkout-success-title"
        className="relative overflow-hidden bg-slate-950 px-4 pb-16 pt-28 text-white sm:px-6 sm:pb-24 sm:pt-36 lg:px-8"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-20 size-96 -translate-x-1/2 rounded-full bg-lime-300/10 blur-3xl"
        />
        <div className="relative mx-auto max-w-5xl">
          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900/95 shadow-2xl shadow-slate-950/40 backdrop-blur-xl">
            <div className="p-6 sm:p-10 lg:p-12">
              <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
                <div className="max-w-3xl">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <output
                      aria-live="polite"
                      className="inline-flex items-center gap-2 rounded-full border border-lime-300/30 bg-lime-300/10 px-3.5 py-1.5 text-sm font-bold text-lime-300"
                    >
                      <CheckCircle2 aria-hidden="true" className="size-4" />
                      {status}
                    </output>

                    {(orderData?.orderNumber ?? orderData?.orderId) && (
                      <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-sm font-semibold text-white">
                        <span>
                          {orderData.orderNumber ??
                            `Order #${orderData.orderId}`}
                        </span>
                        <button
                          aria-label="Copy order number"
                          className="rounded p-0.5 text-slate-300 transition-colors hover:text-lime-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lime-300"
                          onClick={handleCopyOrder}
                          title="Copy order number"
                          type="button"
                        >
                          {copiedOrder ? (
                            <Check
                              aria-hidden="true"
                              className="size-3.5 text-lime-300"
                            />
                          ) : (
                            <Copy aria-hidden="true" className="size-3.5" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  <h1
                    className="mt-6 max-w-3xl text-balance text-4xl font-extrabold tracking-tight text-white sm:text-5xl"
                    id="checkout-success-title"
                  >
                    {title}
                  </h1>
                  <p className="mt-5 max-w-2xl text-pretty text-base leading-7 text-slate-300 sm:text-lg">
                    {description}
                  </p>
                </div>

                <div className="inline-flex shrink-0 items-center gap-2 text-sm text-slate-300">
                  <ShieldCheck
                    aria-hidden="true"
                    className="size-5 text-lime-300"
                  />
                  Securely processed by Stripe
                </div>
              </div>

              <BookingSummary
                isProviderFlow={isProviderFlow}
                orderData={orderData}
              />

              <AccountConnectionCard
                claimAccountSearch={claimAccountSearch}
                handleSendLoginCode={handleSendLoginCode}
                handleVerifyOtp={handleVerifyOtp}
                isProviderFlow={isProviderFlow}
                isSendingOtp={isSendingOtp}
                isVerifyingOtp={isVerifyingOtp}
                orderData={orderData}
                otp={otp}
                otpError={otpError}
                otpSent={otpSent}
                sessionId={search.session_id}
                setOtp={(value) => {
                  setOtp(value);
                  setOtpError(null);
                }}
              />

              <div className="mt-10 border-t border-white/10 pt-8">
                <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-white/60">
                  What happens next
                </h2>
                <ol className="mt-4 grid gap-4 md:grid-cols-3">
                  {steps.map((step, index) => (
                    <SuccessStep index={index + 1} key={step.title} {...step} />
                  ))}
                </ol>
              </div>

              <div className="mt-10 flex flex-col gap-5 border-t border-white/10 pt-8 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-xl text-sm leading-6 text-slate-400">
                  {isProviderFlow
                    ? "Your verification email should arrive shortly."
                    : "Questions about your booking? Keep this confirmation page handy while we prepare your service."}
                </p>
                <div className="flex flex-col gap-3 sm:flex-row">
                  {isProviderFlow ? (
                    <button
                      className={`${actionLinkClassName} bg-lime-300 text-slate-950 hover:bg-lime-200`}
                      onClick={handleProviderVerification}
                      type="button"
                    >
                      Verify email & continue
                      <ArrowRight aria-hidden="true" className="size-4" />
                    </button>
                  ) : (
                    <>
                      <Link
                        className={`${actionLinkClassName} bg-lime-300 text-slate-950 hover:bg-lime-200`}
                        search={claimAccountSearch}
                        to="/claim-account"
                      >
                        Get dashboard access
                        <ArrowRight aria-hidden="true" className="size-4" />
                      </Link>
                      <Link
                        className={`${actionLinkClassName} border border-white/15 text-white hover:border-white/30 hover:bg-white/10`}
                        to="/dashboard"
                      >
                        Open dashboard
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
};

export const Route = createFileRoute("/checkout/success")({
  component: CheckoutSuccessPage,
  head: () => ({
    meta: [
      {
        title: "Booking Confirmed | CastleCare",
      },
      {
        content:
          "Your CastleCare checkout is complete. Get dashboard access with a one-time email code.",
        name: "description",
      },
    ],
  }),
  validateSearch: searchSchema,
});

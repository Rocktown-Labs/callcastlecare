import { cn } from "@callcastlecare/ui/lib/utils";
import {
  createFileRoute,
  Link,
  useRouteContext,
  useSearch,
} from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Clock,
  CreditCard,
  Crown,
  HelpCircle,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { AppShell } from "@/components/dashboard/app-shell";
import { getServerUrl } from "@/lib/server-url";

const storageKey = "callcastlecare.provider-application.v1";

const serviceLabels: Record<string, string> = {
  laundry: "Laundry",
  lawncare: "Lawn Care",
  "window-washing": "Window Washing",
};

const dayLabels: Record<string, string> = {
  friday: "Friday",
  monday: "Monday",
  saturday: "Saturday",
  sunday: "Sunday",
  thursday: "Thursday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
};

const providerSearchSchema = z.object({
  checkout: z.string().optional(),
  plan: z.enum(["free", "pro"]).optional(),
});

interface StoredProviderApplication {
  availableDays?: string[];
  city?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  plan?: "free" | "pro";
  serviceRadiusMiles?: string;
  services?: string[];
  mowerAccess?: string;
  mowerType?: string;
  equipmentPhotoName?: string;
  windowToolsAccess?: string;
  state?: string;
  streetAddress?: string;
  unit?: string;
  zip?: string;
}

const getStoredApplication = () => {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.sessionStorage.getItem(storageKey);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as StoredProviderApplication;
  } catch {
    return null;
  }
};

interface ConnectStatus {
  accountId: string | null;
  onboardingStatus: string;
  payoutsEnabled: boolean;
  providerVerificationPaidAt?: string | null;
  status: string;
  transferCapabilityStatus?: string | null;
}

const getSetupFeeLabel = (status: ConnectStatus | null) => {
  if (!status) {
    return "Checking...";
  }
  return status.providerVerificationPaidAt === null
    ? "Payment due"
    : "Authorized";
};

const getConnectStatusLabel = (status: string | undefined) => {
  if (status === "ready") {
    return "Ready for payouts";
  }
  if (status === "pending") {
    return "Details needed";
  }
  return "Unlocks after approval";
};

const useProviderConnect = () => {
  const [connectStatus, setConnectStatus] = useState<ConnectStatus | null>(
    null
  );
  const [isConnectingStripe, setIsConnectingStripe] = useState(false);
  const [isVerifyingProvider, setIsVerifyingProvider] = useState(false);

  useEffect(() => {
    const loadConnectStatus = async () => {
      try {
        const response = await fetch(
          new URL("/api/v1/driver/connect/status", getServerUrl()),
          {
            credentials: "include",
            method: "POST",
          }
        );
        if (response.ok) {
          setConnectStatus((await response.json()) as ConnectStatus);
        }
      } catch {
        // The holding page remains usable while Connect is being configured.
      }
    };

    void loadConnectStatus();
  }, []);

  const startConnectOnboarding = async () => {
    setIsConnectingStripe(true);
    try {
      const response = await fetch(
        new URL("/api/v1/driver/connect/account-link", getServerUrl()),
        {
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }
      );
      const payload = (await response.json()) as {
        error?: string;
        url?: string;
      };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "Connect onboarding is unavailable.");
      }
      window.location.href = payload.url;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Connect onboarding is unavailable."
      );
      setIsConnectingStripe(false);
    }
  };

  const startProviderVerification = async () => {
    setIsVerifyingProvider(true);
    try {
      const response = await fetch(
        new URL("/api/v1/checkout/provider/resume", getServerUrl()),
        {
          body: JSON.stringify({ plan: "standard_provider" }),
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }
      );
      const payload = (await response.json()) as {
        error?: string;
        url?: string;
      };
      if (!(response.ok && payload.url)) {
        throw new Error(
          payload.error ?? "Provider verification is unavailable."
        );
      }
      window.location.href = payload.url;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Provider verification is unavailable."
      );
      setIsVerifyingProvider(false);
    }
  };

  return {
    connectStatus,
    isConnectingStripe,
    isVerifyingProvider,
    startConnectOnboarding,
    startProviderVerification,
  };
};

const useProviderEquipmentUpload = () => {
  const [isUploadingEquipment, setIsUploadingEquipment] = useState(false);

  const uploadEquipmentPhoto = async (file: File) => {
    setIsUploadingEquipment(true);
    try {
      const uploadUrlResponse = await fetch(
        new URL("/api/v1/media/upload-url", getServerUrl()),
        {
          body: JSON.stringify({
            contentType: file.type || "image/jpeg",
            mediaType: "provider_equipment",
          }),
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }
      );
      if (!uploadUrlResponse.ok) {
        throw new Error("Equipment photo upload is not configured.");
      }

      const uploadPayload = (await uploadUrlResponse.json()) as {
        storagePath: string;
        uploadUrl: string;
      };

      const formData = new FormData();
      formData.append("storagePath", uploadPayload.storagePath);
      formData.append("file", file);

      const uploadResponse = await fetch(
        new URL(uploadPayload.uploadUrl, getServerUrl()),
        {
          body: formData,
          credentials: "include",
          method: "POST",
        }
      );

      if (!uploadResponse.ok) {
        const errorPayload = (await uploadResponse
          .json()
          .catch(() => ({ error: "Equipment photo upload failed" }))) as {
          error?: string;
        };
        throw new Error(errorPayload.error ?? "Equipment photo upload failed");
      }

      const uploadResult = (await uploadResponse.json()) as {
        storagePath: string;
      };

      const attachResponse = await fetch(
        new URL("/api/v1/media/attach", getServerUrl()),
        {
          body: JSON.stringify({
            mediaType: "provider_equipment",
            metadata: {
              originalName: file.name,
              source: "provider_onboarding",
            },
            storagePath: uploadResult.storagePath,
          }),
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }
      );
      if (!attachResponse.ok) {
        throw new Error("Equipment photo uploaded but could not be saved.");
      }
      toast.success("Equipment photo saved for onboarding review.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Equipment photo upload failed."
      );
    } finally {
      setIsUploadingEquipment(false);
    }
  };

  return { isUploadingEquipment, uploadEquipmentPhoto };
};

const PlanBadge = ({ plan }: Readonly<{ plan: "free" | "pro" }>) => {
  const isPro = plan === "pro";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black",
        isPro ? "bg-lime-300 text-slate-950" : "bg-slate-950 text-white"
      )}
    >
      {isPro ? <Crown className="size-4" /> : <BadgeCheck className="size-4" />}
      {isPro ? "CastleCare Pro (60/40 payout)" : "Standard Provider"}
    </span>
  );
};

const ApplicantInfoCard = ({
  addressParts,
  application,
  isProfileSaved,
  name,
}: Readonly<{
  addressParts: (string | null | undefined)[];
  application: StoredProviderApplication | null;
  isProfileSaved: boolean;
  name: string;
}>) => (
  <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
      <h2 className="text-xl font-black">{name}</h2>
      <span className="text-xs font-bold text-slate-500">
        {isProfileSaved ? "Profile Saved" : "Queue Received"}
      </span>
    </div>

    <div className="mt-4 grid gap-3 text-sm text-slate-600">
      <p className="flex items-start gap-2">
        <BriefcaseBusiness className="mt-0.5 size-4 shrink-0 text-lime-700" />
        <span>
          {(application?.services ?? [])
            .map((service) => serviceLabels[service] ?? service)
            .join(", ") || "Services pending"}
        </span>
      </p>
      <p className="flex items-start gap-2">
        <CalendarDays className="mt-0.5 size-4 shrink-0 text-lime-700" />
        <span>
          {(application?.availableDays ?? [])
            .map((day) => dayLabels[day] ?? day)
            .join(", ") || "Availability pending"}
        </span>
      </p>
      <p className="flex items-start gap-2">
        <MapPin className="mt-0.5 size-4 shrink-0 text-lime-700" />
        <span>
          {addressParts.join(", ") || "Address pending"} (
          {application?.serviceRadiusMiles ?? 20} mi radius)
        </span>
      </p>
    </div>
  </div>
);

const ProviderStatusTracker = ({
  connectStatus,
}: Readonly<{ connectStatus: ConnectStatus | null }>) => (
  <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    <div className="flex items-start gap-3">
      <span className="flex size-10 items-center justify-center rounded-full bg-lime-100 text-lime-800">
        <ShieldCheck className="size-5" />
      </span>
      <div>
        <h2 className="text-xl font-black">Same-Day Screening Status</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          CastleCare admins review your background check, driving record (MVR),
          vehicle specs, and ZIP code service radius.
        </p>
      </div>
    </div>

    <div className="mt-6 grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-xs font-black uppercase text-emerald-800">
          $50 Setup Fee
        </p>
        <p className="mt-1 flex items-center gap-1 font-black text-emerald-900">
          <CheckCircle2 className="size-4 text-emerald-600" />
          {getSetupFeeLabel(connectStatus)}
        </p>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-xs font-black uppercase text-amber-800">
          Background Check
        </p>
        <p className="mt-1 flex items-center gap-1 font-black text-amber-900">
          <Clock className="size-4 text-amber-600" />
          In Progress
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-black uppercase text-slate-400">
          Stripe Connect
        </p>
        <p className="mt-1 font-black text-slate-500">
          {getConnectStatusLabel(connectStatus?.status)}
        </p>
      </div>
    </div>
  </div>
);

const ProviderConnectBanner = (props: {
  connectStatus: ConnectStatus | null;
  isConnectingStripe: boolean;
  isUploadingEquipment: boolean;
  isVerifyingProvider: boolean;
  onConnect: () => void;
  onEquipmentPhoto: (file: File) => void;
  onVerifyProvider: () => void;
}) => (
  <section className="rounded-3xl border border-lime-300/60 bg-lime-100/50 p-6 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="max-w-2xl">
        <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-lime-900">
          <CreditCard className="size-4" />
          Stripe Connect Payout Integration
        </p>
        <h2 className="mt-2 text-2xl font-black text-slate-950">
          Automated 60/40 Direct Deposits
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          Once background screening is approved by CastleCare admin, your
          <strong> Stripe Connect</strong> onboarding button will unlock right
          here to link your bank account for job payouts.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        {props.connectStatus?.providerVerificationPaidAt === null ? (
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-slate-950 px-5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
            disabled={props.isVerifyingProvider}
            onClick={props.onVerifyProvider}
            type="button"
          >
            <ShieldCheck className="size-4" />
            {props.isVerifyingProvider
              ? "Opening Stripe..."
              : "Complete $50 verification"}
          </button>
        ) : null}
        {props.connectStatus?.onboardingStatus === "approved" &&
        props.connectStatus.status !== "ready" ? (
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-lime-300 px-5 text-sm font-bold text-slate-950 hover:bg-lime-200 disabled:opacity-60"
            disabled={props.isConnectingStripe}
            onClick={props.onConnect}
            type="button"
          >
            <CreditCard className="size-4" />
            {props.isConnectingStripe
              ? "Opening Stripe..."
              : "Connect payout account"}
          </button>
        ) : null}
        <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-5 text-sm font-bold text-slate-950 hover:bg-slate-50">
          <input
            accept="image/jpeg,image/png,image/webp,image/heic"
            className="sr-only"
            disabled={props.isUploadingEquipment}
            onChange={(event) => {
              const [file] = event.currentTarget.files ?? [];
              if (file) {
                props.onEquipmentPhoto(file);
              }
              event.currentTarget.value = "";
            }}
            type="file"
          />
          {props.isUploadingEquipment
            ? "Uploading photo..."
            : "Add equipment photo"}
        </label>
        <Link
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-slate-950 px-5 text-sm font-bold text-white hover:bg-slate-800"
          to="/dashboard/help"
        >
          <HelpCircle className="size-4 text-lime-400" />
          Contact Onboarding Support
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  </section>
);

const ProviderEquipmentGuide = () => (
  <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    <div>
      <p className="text-xs font-black uppercase tracking-wider text-lime-700">
        Starter equipment guide
      </p>
      <h2 className="mt-1 text-2xl font-black text-slate-950">
        Prepare for your first route
      </h2>
    </div>
    <div className="mt-5 grid gap-3 md:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="font-black text-slate-950">Lawn Care</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Push, riding, or commercial mower, string trimmer, blower, fuel, and
          basic safety gear.
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="font-black text-slate-950">Laundry</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          A reliable car is preferred. CastleCare provides the pickup bags and
          route instructions.
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="font-black text-slate-950">Window Washing</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Squeegee, extension pole, bucket, towels, and a safe ladder. We will
          send a recommended kit before dispatch.
        </p>
      </div>
    </div>
  </section>
);

const ProviderStatusRoute = () => {
  const { session } = useRouteContext({ from: "/_auth/dashboard" });
  const { plan } = useSearch({ from: "/_auth/dashboard/provider" });
  const application = useMemo(() => getStoredApplication(), []);
  const {
    connectStatus,
    isConnectingStripe,
    isVerifyingProvider,
    startConnectOnboarding,
    startProviderVerification,
  } = useProviderConnect();
  const { isUploadingEquipment, uploadEquipmentPhoto } =
    useProviderEquipmentUpload();
  const [isProfileSaved, setIsProfileSaved] = useState(false);

  useEffect(() => {
    if (
      !(application?.email && application.firstName && application.lastName)
    ) {
      return;
    }

    const saveProviderProfile = async () => {
      const parsedRadius = Number(application.serviceRadiusMiles ?? 20);
      const response = await fetch(
        new URL("/api/v1/driver/profile", getServerUrl()),
        {
          body: JSON.stringify({
            applicationFormData: {
              ...application,
              paidAmountCents: 5000,
              paidAt: new Date().toISOString(),
              paymentStatus: "paid_express_50",
            },
            email: application.email,
            equipmentJson: {
              equipmentPhotoName: application.equipmentPhotoName ?? null,
              mowerAccess: application.mowerAccess ?? null,
              mowerType: application.mowerType ?? null,
              windowToolsAccess: application.windowToolsAccess ?? null,
            },
            firstName: application.firstName,
            lastName: application.lastName,
            phone: application.phone ?? "",
            serviceRadiusMiles: Number.isFinite(parsedRadius)
              ? parsedRadius
              : 20,
            servicesOffered: application.services ?? [],
          }),
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }
      );

      if (!response.ok) {
        toast.error("Provider profile could not be saved for admin review.");
        return;
      }

      setIsProfileSaved(true);
    };

    void saveProviderProfile();
  }, [application]);

  const selectedPlan = application?.plan ?? plan;
  const applicantName =
    [application?.firstName, application?.lastName].filter(Boolean).join(" ") ||
    "Provider Applicant";
  const addressParts = [
    application?.streetAddress,
    application?.unit ? `Unit ${application.unit}` : null,
    application?.city,
    application?.state,
    application?.zip,
  ].filter(Boolean);

  return (
    <AppShell userEmail={session.data?.user?.email ?? ""} variant="provider">
      <main className="px-4 py-6 text-slate-950 sm:py-10">
        <div className="mx-auto grid max-w-6xl gap-6">
          {/* Header Banner */}
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-black uppercase text-amber-900">
                  <Clock className="size-3.5 animate-pulse" />
                  Background & MVR Screening Active
                </div>
                <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                  Provider Holding Spot & Work Hub
                </h1>
                <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">
                  Welcome to CastleCare! Your{" "}
                  <strong>$50 Express Verification Fee</strong> is authorized,
                  and your background check is currently being processed by our
                  compliance team.
                </p>
              </div>
              <PlanBadge plan={selectedPlan} />
            </div>
          </section>

          {/* Status Tracker */}
          <section className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
            <ProviderStatusTracker connectStatus={connectStatus} />
            <ApplicantInfoCard
              addressParts={addressParts}
              application={application}
              isProfileSaved={isProfileSaved}
              name={applicantName}
            />
          </section>

          <ProviderConnectBanner
            connectStatus={connectStatus}
            isConnectingStripe={isConnectingStripe}
            isUploadingEquipment={isUploadingEquipment}
            isVerifyingProvider={isVerifyingProvider}
            onConnect={() => void startConnectOnboarding()}
            onEquipmentPhoto={(file) => void uploadEquipmentPhoto(file)}
            onVerifyProvider={() => void startProviderVerification()}
          />
          <ProviderEquipmentGuide />
        </div>
      </main>
    </AppShell>
  );
};

export const Route = createFileRoute("/_auth/dashboard/provider")({
  component: ProviderStatusRoute,
  validateSearch: (search) => {
    const result = providerSearchSchema.safeParse(search);
    return {
      checkout: result.success ? result.data.checkout : undefined,
      plan: result.success ? (result.data.plan ?? "free") : "free",
    };
  },
});

import {
  formatUsPhoneInput,
  phoneSchema,
} from "@callcastlecare/api/validation";
import { Button } from "@callcastlecare/ui/components/button";
import { Checkbox } from "@callcastlecare/ui/components/checkbox";
import { Input } from "@callcastlecare/ui/components/input";
import { Label } from "@callcastlecare/ui/components/label";
import { Textarea } from "@callcastlecare/ui/components/textarea";
import { cn } from "@callcastlecare/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  Car,
  Check,
  ClipboardList,
  Crown,
  Home,
  LoaderCircle,
  Lock,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { RadarAddressInput } from "@/components/home/radar-address-input";
import type { RadarAddressSuggestion } from "@/components/home/use-radar-address-autocomplete";
import { validateAddress } from "@/components/home/use-radar-address-autocomplete";
import { getServerUrl } from "@/lib/server-url";

const storageKey = "callcastlecare.provider-application.v1";
const maxVehicleYear = new Date().getFullYear() + 1;
const minVehicleSearchLength = 5;
const minimumProviderAge = 18;
const nhtsaVehicleResponseSchema = z.object({
  Results: z.array(
    z.object({
      Make_Name: z.string(),
      Model_ID: z.number().optional(),
      Model_Name: z.string(),
    })
  ),
});

interface VehicleOption {
  id: string;
  label: string;
  make: string;
  model: string;
  year: string;
}

type VehicleSearchStatus = "idle" | "loading" | "ready" | "error";

const providerServices = [
  {
    description: "Mowing, edging, trimming, and cleanup.",
    id: "lawncare",
    label: "Lawn Care",
  },
  {
    description: "Pickup, delivery, wash and fold, and bedding support.",
    id: "laundry",
    label: "Laundry",
  },
  {
    description: "Exterior and interior glass service.",
    id: "window-washing",
    label: "Window Washing",
  },
] as const;

const steps = [
  { icon: User, id: "contact", label: "Contact" },
  { icon: BriefcaseBusiness, id: "services", label: "Jobs" },
  { icon: Car, id: "vehicle", label: "Vehicle" },
  { icon: Lock, id: "account", label: "Account" },
  { icon: Crown, id: "plan", label: "Plan & Checkout" },
] as const;

const availabilityDays = [
  { id: "monday", label: "Monday" },
  { id: "tuesday", label: "Tuesday" },
  { id: "wednesday", label: "Wednesday" },
  { id: "thursday", label: "Thursday" },
  { id: "friday", label: "Friday" },
  { id: "saturday", label: "Saturday" },
  { id: "sunday", label: "Sunday" },
] as const;

const planOptions = [
  {
    description:
      "Express same-day background and MVR screening with priority route access. No recurring monthly membership fees.",
    id: "pro",
    label: "CastleCare Pro Express Onboarding",
    price: "$50",
    split: "60/40",
  },
] as const;

type StepId = (typeof steps)[number]["id"];
type ProviderServiceId = (typeof providerServices)[number]["id"];
type ProviderPlan = (typeof planOptions)[number]["id"];
type AvailabilityDay = (typeof availabilityDays)[number]["id"];

interface ProviderApplicationDraft {
  addressLatitude: number | null;
  addressLongitude: number | null;
  addressValidated: boolean;
  availableDays: AvailabilityDay[];
  confirmPassword: string;
  dateOfBirth: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  streetAddress: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
  fullAddress: string;
  services: ProviderServiceId[];
  canDoAllServices: boolean;
  serviceNotes: string;
  mowerAccess: "" | "no" | "yes";
  mowerType: "" | "commercial" | "push" | "riding";
  equipmentPhotoName: string;
  hasVehicle: boolean;
  windowToolsAccess: "" | "no" | "yes";
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  vehicleColor: string;
  licensePlate: string;
  password: string;
  vin: string;
  serviceRadiusMiles: string;
  termsAccepted: boolean;
  plan: ProviderPlan;
  cardName: string;
  cardNumber: string;
  cardExpiry: string;
  cardCvc: string;
  cardZip: string;
}

const initialDraft: ProviderApplicationDraft = {
  addressLatitude: null,
  addressLongitude: null,
  addressValidated: false,
  availableDays: [],
  canDoAllServices: false,
  cardCvc: "",
  cardExpiry: "",
  cardName: "",
  cardNumber: "",
  cardZip: "",
  city: "",
  confirmPassword: "",
  dateOfBirth: "",
  email: "",
  equipmentPhotoName: "",
  firstName: "",
  fullAddress: "",
  hasVehicle: true,
  lastName: "",
  licensePlate: "",
  mowerAccess: "",
  mowerType: "",
  password: "",
  phone: "",
  plan: "pro",
  serviceNotes: "",
  serviceRadiusMiles: "20",
  services: [],
  state: "AR",
  streetAddress: "",
  termsAccepted: false,
  unit: "",
  vehicleColor: "",
  vehicleMake: "",
  vehicleModel: "",
  vehicleYear: "",
  vin: "",
  windowToolsAccess: "",
  zip: "",
};

const getAge = (value: string) => {
  const birthDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() &&
      today.getDate() >= birthDate.getDate());

  if (!hasHadBirthdayThisYear) {
    age -= 1;
  }

  return age;
};

const serviceSchema = z
  .array(z.enum(["lawncare", "laundry", "window-washing"]))
  .min(1, "Select at least one job type.");

const contactSchema = z.object({
  city: z.string().trim().min(2, "Enter your city."),
  dateOfBirth: z
    .string()
    .trim()
    .min(1, "Enter your date of birth.")
    .refine((value) => (getAge(value) ?? 0) >= minimumProviderAge, {
      message: `You must be at least ${minimumProviderAge} to apply.`,
    }),
  email: z.string().trim().email("Enter a valid email."),
  firstName: z.string().trim().min(1, "Enter your first name."),
  lastName: z.string().trim().min(1, "Enter your last name."),
  phone: phoneSchema,
  state: z.string().trim().length(2, "Use the two-letter state code."),
  streetAddress: z.string().trim().min(5, "Enter your street address."),
  unit: z.string().trim().max(40, "Use 40 characters or fewer.").optional(),
  zip: z
    .string()
    .trim()
    .regex(/^\d{5}$/u, "Enter a 5-digit ZIP code."),
});

const servicesSchema = z
  .object({
    equipmentPhotoName: z.string().trim().max(160).optional(),
    mowerAccess: z.enum(["", "no", "yes"]),
    mowerType: z.enum(["", "commercial", "push", "riding"]),
    serviceNotes: z.string().trim().max(600).optional(),
    services: serviceSchema,
    windowToolsAccess: z.enum(["", "no", "yes"]),
  })
  .superRefine((value, context) => {
    if (value.services.includes("lawncare")) {
      if (value.mowerAccess === "") {
        context.addIssue({
          code: "custom",
          message: "Tell us whether you own or can access a mower.",
          path: ["mowerAccess"],
        });
      }
      if (value.mowerAccess === "yes" && value.mowerType === "") {
        context.addIssue({
          code: "custom",
          message: "Choose the mower type you can use.",
          path: ["mowerType"],
        });
      }
    }

    if (
      value.services.includes("window-washing") &&
      value.windowToolsAccess === ""
    ) {
      context.addIssue({
        code: "custom",
        message: "Tell us whether you can access a squeegee and ladder.",
        path: ["windowToolsAccess"],
      });
    }
  });

const vehicleSchema = z
  .object({
    availableDays: z
      .array(
        z.enum([
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
          "sunday",
        ])
      )
      .min(1, "Select at least one day you can work."),
    hasVehicle: z.boolean(),
    licensePlate: z.string().trim().max(12, "Use 12 characters or fewer."),
    serviceRadiusMiles: z
      .string()
      .trim()
      .regex(/^\d+$/u, "Enter a service radius.")
      .refine((value) => Number(value) >= 5 && Number(value) <= 100, {
        message: "Use a radius from 5 to 100 miles.",
      }),
    vehicleColor: z.string().trim(),
    vehicleMake: z.string().trim(),
    vehicleModel: z.string().trim(),
    vehicleYear: z.string().trim(),
    vin: z
      .string()
      .trim()
      .toUpperCase()
      .refine(
        (value) => value === "" || /^[A-Z0-9]{17}$/u.test(value),
        "VIN can be added later. If entered now, use 17 characters."
      ),
  })
  .superRefine((value, context) => {
    if (!value.hasVehicle) {
      return;
    }

    const requiredVehicleFields = [
      ["vehicleMake", "Choose the vehicle from the lookup."],
      ["vehicleModel", "Choose the vehicle from the lookup."],
      ["vehicleYear", "Choose the vehicle from the lookup."],
      ["vehicleColor", "Enter the vehicle color."],
    ] as const;

    for (const [field, message] of requiredVehicleFields) {
      if (!value[field]) {
        context.addIssue({
          code: "custom",
          message,
          path: [field],
        });
      }
    }

    if (value.vehicleYear) {
      const year = Number(value.vehicleYear);
      const hasValidYear =
        /^\d{4}$/u.test(value.vehicleYear) &&
        year >= 1980 &&
        year <= maxVehicleYear;

      if (!hasValidYear) {
        context.addIssue({
          code: "custom",
          message: `Use a year from 1980 to ${maxVehicleYear}.`,
          path: ["vehicleYear"],
        });
      }
    }
  });

const planSchema = z.object({
  plan: z.enum(["free", "pro"]),
});

const accountSchema = z
  .object({
    confirmPassword: z.string().min(8, "Confirm your password."),
    password: z.string().min(8, "Use at least 8 characters."),
    termsAccepted: z.boolean().refine((value) => value, {
      message:
        "Agree to Provider Terms & 1099 Contractor Agreement to continue.",
    }),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords must match.",
    path: ["confirmPassword"],
  });

const fullApplicationSchema = vehicleSchema
  .safeExtend({
    ...contactSchema.shape,
    ...planSchema.shape,
    ...servicesSchema.shape,
  })
  .safeExtend(accountSchema.shape)
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords must match.",
    path: ["confirmPassword"],
  });

type FieldErrors = Partial<Record<keyof ProviderApplicationDraft, string>>;

const getStepIndex = (step: StepId) =>
  steps.findIndex((stepItem) => stepItem.id === step);

const getFlattenedErrors = <Output,>(result: z.ZodSafeParseResult<Output>) =>
  result.success
    ? {}
    : Object.fromEntries(
        Object.entries(
          result.error.flatten().fieldErrors as Record<string, string[]>
        ).map(([field, messages]) => [
          field,
          messages?.[0] ?? "Check this field.",
        ])
      );

const getStringField = (source: Record<string, unknown>, key: string) =>
  typeof source[key] === "string" ? source[key] : "";

const parseAddressString = (address: string) => {
  const zipMatch = address.match(/\b(?<zip>\d{5})(?:-\d{4})?\b/u);
  const zip = zipMatch?.groups?.zip ?? "";

  const stateMatch = address.match(/\b(?<state>[A-Z]{2})\b(?:\s+\d{5})?/iu);
  const state = stateMatch?.groups?.state?.toUpperCase() ?? "";

  let city = "";
  let streetAddress = address;

  const parts = address.split(",").map((part) => part.trim());
  if (parts.length >= 3) {
    streetAddress = parts[0] ?? address;
    city = parts[1] ?? "";
  } else if (parts.length === 2) {
    streetAddress = parts[0] ?? address;
    const cityStatePart = parts[1] ?? "";
    const cleanCity = cityStatePart
      .replace(/\b[A-Z]{2}\b/iu, "")
      .replace(/\b\d{5}(?:-\d{4})?\b/u, "")
      .trim();
    if (cleanCity) {
      city = cleanCity;
    }
  }

  return { city, state, streetAddress, zip };
};

const getNestedRaw = (raw: Record<string, unknown>) =>
  typeof raw.raw === "object" && raw.raw !== null
    ? (raw.raw as Record<string, unknown>)
    : {};

const getRawField = (
  raw: Record<string, unknown>,
  nestedRaw: Record<string, unknown>,
  ...keys: string[]
) => {
  for (const key of keys) {
    const val = getStringField(raw, key) || getStringField(nestedRaw, key);
    if (val) {
      return val;
    }
  }
  return "";
};

const getParsedAddressParts = (suggestion: RadarAddressSuggestion) => {
  const raw = suggestion.raw ?? {};
  const nestedRaw = getNestedRaw(raw);

  const numberStr = getRawField(raw, nestedRaw, "number");
  const streetStr = getRawField(raw, nestedRaw, "street");
  const streetCombined =
    numberStr && streetStr ? `${numberStr} ${streetStr}` : streetStr;

  const city = getRawField(raw, nestedRaw, "city");
  const state = getRawField(raw, nestedRaw, "stateCode", "state");
  const zip = getRawField(raw, nestedRaw, "postalCode", "zip");

  const fallback = parseAddressString(suggestion.label);
  const finalState = state.length === 2 ? state.toUpperCase() : fallback.state;

  return {
    city: city || fallback.city,
    state: finalState,
    streetAddress:
      streetCombined ||
      getStringField(raw, "streetAddress") ||
      fallback.streetAddress ||
      suggestion.label,
    zip: zip || fallback.zip,
  };
};

const getStepErrors = (
  step: StepId,
  draft: ProviderApplicationDraft
): FieldErrors => {
  if (step === "contact") {
    return getFlattenedErrors(contactSchema.safeParse(draft)) as FieldErrors;
  }

  if (step === "services") {
    return getFlattenedErrors(servicesSchema.safeParse(draft)) as FieldErrors;
  }

  if (step === "vehicle") {
    return getFlattenedErrors(vehicleSchema.safeParse(draft)) as FieldErrors;
  }

  if (step === "plan") {
    return getFlattenedErrors(planSchema.safeParse(draft)) as FieldErrors;
  }

  return getFlattenedErrors(accountSchema.safeParse(draft)) as FieldErrors;
};

const FieldError = ({ children }: { children?: string }) =>
  children ? (
    <p className="mt-2 text-xs font-medium text-red-200">{children}</p>
  ) : null;

const WizardInput = ({
  error,
  icon: Icon,
  label,
  ...props
}: React.ComponentProps<typeof Input> & {
  error?: string;
  icon: LucideIcon;
  label: string;
}) => (
  <div>
    <Label className="text-white/72" htmlFor={props.id}>
      {label}
    </Label>
    <div className="relative mt-2">
      <Icon
        aria-hidden="true"
        className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/35"
      />
      <Input
        {...props}
        aria-invalid={error ? true : undefined}
        className={cn(
          "h-11 rounded-2xl border-white/10 bg-white/[0.06] pl-10 text-white placeholder:text-white/30",
          error && "border-red-300/60"
        )}
      />
    </div>
    <FieldError>{error}</FieldError>
  </div>
);

const getVehicleQueryParts = (query: string) => {
  const normalized = query.trim().replaceAll(/\s+/gu, " ");
  const yearMatch = normalized.match(/\b(?<year>19[8-9]\d|20\d{2})\b/u);
  const { year } = yearMatch?.groups ?? {};

  if (!year) {
    return null;
  }

  const words = normalized.replace(year, "").trim().split(" ").filter(Boolean);

  const [make, ...modelParts] = words;
  if (!make) {
    return null;
  }

  return {
    make,
    modelQuery: modelParts.join(" ").toLowerCase(),
    year,
  };
};

const getNhtsaVehicleOptions = async (
  query: string,
  signal: AbortSignal
): Promise<VehicleOption[]> => {
  const parts = getVehicleQueryParts(query);
  if (!parts || Number(parts.year) < 1996) {
    return [];
  }

  const url = new URL(
    `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(
      parts.make
    )}/modelyear/${parts.year}`
  );
  url.searchParams.set("format", "json");

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error("Vehicle lookup failed");
  }

  const payload = nhtsaVehicleResponseSchema.parse(await response.json());
  const seen = new Set<string>();

  return payload.Results.flatMap((item) => {
    const make = item.Make_Name.trim();
    const model = item.Model_Name.trim();
    const haystack = `${make} ${model}`.toLowerCase();

    if (parts.modelQuery && !haystack.includes(parts.modelQuery)) {
      return [];
    }

    const id = `${parts.year}-${make}-${model}`.toLowerCase();
    if (seen.has(id)) {
      return [];
    }
    seen.add(id);

    return [
      {
        id,
        label: `${parts.year} ${make} ${model}`,
        make,
        model,
        year: parts.year,
      },
    ];
  }).slice(0, 8);
};

const VehicleLookup = ({
  error,
  onClear,
  onSelect,
  selectedLabel,
}: {
  error?: string;
  onClear: () => void;
  onSelect: (option: VehicleOption) => void;
  selectedLabel?: string;
}) => {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<VehicleOption[]>([]);
  const [status, setStatus] = useState<VehicleSearchStatus>("idle");

  useEffect(() => {
    if (query.trim().length < minVehicleSearchLength) {
      return;
    }

    const controller = new AbortController();

    const loadVehicleOptions = async () => {
      setStatus("loading");
      try {
        const nextOptions = await getNhtsaVehicleOptions(
          query,
          controller.signal
        );
        setOptions(nextOptions);
        setStatus("ready");
      } catch (error_: unknown) {
        if (error_ instanceof DOMException && error_.name === "AbortError") {
          return;
        }
        setOptions([]);
        setStatus("error");
      }
    };

    const timeoutId = window.setTimeout(() => {
      void loadVehicleOptions();
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  const updateQuery = (event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setQuery(value);
    onClear();

    if (value.trim().length < minVehicleSearchLength) {
      setOptions([]);
      setStatus("idle");
    }
  };

  const selectOption = (option: VehicleOption) => {
    setQuery(option.label);
    setOptions([]);
    setStatus("idle");
    onSelect(option);
  };

  return (
    <div className="sm:col-span-2">
      <Label className="text-white/72" htmlFor="vehicle-search">
        Vehicle
      </Label>
      <div className="relative mt-2">
        <Car
          aria-hidden="true"
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/35"
        />
        <Input
          aria-autocomplete="list"
          aria-controls="vehicle-options"
          aria-expanded={options.length > 0}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          className={cn(
            "h-11 rounded-2xl border-white/10 bg-white/[0.06] pl-10 text-white placeholder:text-white/30",
            error && "border-red-300/60"
          )}
          id="vehicle-search"
          onChange={updateQuery}
          placeholder="Type year, make, and model"
          value={query}
        />
      </div>
      {status === "loading" ? (
        <p className="mt-2 text-xs text-white/45">
          Checking vehicle matches...
        </p>
      ) : null}
      {status === "ready" && options.length > 0 ? (
        <div
          className="mt-2 overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-xl"
          id="vehicle-options"
        >
          {options.map((option) => (
            <button
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm text-white transition-colors hover:bg-lime-300/10"
              key={option.id}
              onClick={() => selectOption(option)}
              type="button"
            >
              <span>{option.label}</span>
              <Check aria-hidden="true" className="size-4 text-lime-300" />
            </button>
          ))}
        </div>
      ) : null}
      {status === "ready" &&
      query.trim().length >= minVehicleSearchLength &&
      options.length === 0 ? (
        <p className="mt-2 text-xs text-white/45">
          No matching vehicle found yet. Try the year and make first, then pick
          the closest model.
        </p>
      ) : null}
      {status === "error" ? (
        <p className="mt-2 text-xs font-medium text-red-200">
          Vehicle lookup is unavailable. Try again in a moment.
        </p>
      ) : null}
      {selectedLabel ? (
        <p className="mt-2 text-xs text-lime-100">Selected: {selectedLabel}</p>
      ) : null}
      <FieldError>{error}</FieldError>
    </div>
  );
};

// The wizard keeps step orchestration local so validation, saved draft state,
// and account creation stay in one place while the provider flow is still new.
// eslint-disable-next-line complexity
export default function EarnOnboarding() {
  const [activeStep, setActiveStep] = useState<StepId>("contact");
  const [draft, setDraft] = useState<ProviderApplicationDraft>(initialDraft);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeStepIndex = getStepIndex(activeStep);
  const selectedPlan = useMemo(
    () =>
      planOptions.find((option) => option.id === draft.plan) ?? planOptions[0],
    [draft.plan]
  );

  const updateDraft = <Key extends keyof ProviderApplicationDraft>(
    key: Key,
    value: ProviderApplicationDraft[Key]
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const { [key]: _removed, ...next } = current;
      return next;
    });
  };

  const updateTextField =
    (key: keyof ProviderApplicationDraft) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      updateDraft(key, event.target.value as never);
    };

  const updatePhone = (event: ChangeEvent<HTMLInputElement>) => {
    updateDraft("phone", formatUsPhoneInput(event.target.value));
  };

  const updateAddress = (value: string) => {
    const parsed = parseAddressString(value);
    setDraft((current) => ({
      ...current,
      addressLatitude: null,
      addressLongitude: null,
      addressValidated: false,
      city: parsed.city || current.city,
      fullAddress: value,
      state: parsed.state || current.state,
      streetAddress: parsed.streetAddress || value,
      zip: parsed.zip || current.zip,
    }));
    setErrors((current) => {
      const {
        city: _city,
        state: _state,
        streetAddress: _streetAddress,
        zip: _zip,
        ...next
      } = current;
      return next;
    });
  };

  const selectAddress = async (suggestion: RadarAddressSuggestion) => {
    const validated = await validateAddress(suggestion.label).catch(() => null);
    const selected = validated ?? suggestion;
    const parts = getParsedAddressParts(selected);

    setDraft((current) => ({
      ...current,
      addressLatitude: selected.latitude,
      addressLongitude: selected.longitude,
      addressValidated: Boolean(validated),
      city: parts.city || current.city,
      fullAddress: selected.label,
      state: parts.state || current.state,
      streetAddress: parts.streetAddress || selected.label,
      zip: parts.zip || current.zip,
    }));
    setErrors((current) => {
      const {
        city: _city,
        state: _state,
        streetAddress: _streetAddress,
        zip: _zip,
        ...next
      } = current;
      return next;
    });
  };

  const toggleAvailabilityDay = (day: AvailabilityDay) => {
    setDraft((current) => {
      const availableDays = current.availableDays.includes(day)
        ? current.availableDays.filter((item) => item !== day)
        : [...current.availableDays, day];

      return {
        ...current,
        availableDays,
      };
    });
    setErrors((current) => ({ ...current, availableDays: undefined }));
  };

  const clearVehicleSelection = () => {
    setDraft((current) => ({
      ...current,
      vehicleMake: "",
      vehicleModel: "",
      vehicleYear: "",
    }));
    setErrors((current) => {
      const {
        vehicleMake: _vehicleMake,
        vehicleModel: _vehicleModel,
        vehicleYear: _vehicleYear,
        ...next
      } = current;
      return next;
    });
  };

  const selectVehicle = (option: VehicleOption) => {
    setDraft((current) => ({
      ...current,
      vehicleMake: option.make,
      vehicleModel: option.model,
      vehicleYear: option.year,
    }));
    setErrors((current) => {
      const {
        vehicleMake: _vehicleMake,
        vehicleModel: _vehicleModel,
        vehicleYear: _vehicleYear,
        ...next
      } = current;
      return next;
    });
  };

  const toggleService = (serviceId: ProviderServiceId) => {
    setDraft((current) => {
      const hasService = current.services.includes(serviceId);
      const services = hasService
        ? current.services.filter((id) => id !== serviceId)
        : [...current.services, serviceId];

      return {
        ...current,
        canDoAllServices: services.length === providerServices.length,
        services,
      };
    });
    setErrors((current) => ({ ...current, services: undefined }));
  };

  const toggleAllServices = () => {
    const allServices = providerServices.map(({ id }) => id);
    setDraft((current) => ({
      ...current,
      canDoAllServices: !current.canDoAllServices,
      services: current.canDoAllServices ? [] : allServices,
    }));
    setErrors((current) => ({ ...current, services: undefined }));
  };

  const goToStep = (step: StepId) => {
    if (getStepIndex(step) <= activeStepIndex) {
      setActiveStep(step);
      setErrors({});
    }
  };

  const ensureValidatedAddress = async (
    currentDraft: ProviderApplicationDraft
  ) => {
    const addressQuery = (
      currentDraft.fullAddress || currentDraft.streetAddress
    ).trim();
    if (
      !addressQuery ||
      (currentDraft.addressValidated &&
        currentDraft.city &&
        currentDraft.state &&
        currentDraft.zip)
    ) {
      return currentDraft;
    }

    const validated = await validateAddress(addressQuery).catch(() => null);
    if (validated) {
      const parts = getParsedAddressParts(validated);
      return {
        ...currentDraft,
        addressLatitude: validated.latitude,
        addressLongitude: validated.longitude,
        addressValidated: true,
        city: parts.city || currentDraft.city,
        fullAddress: validated.label,
        state: parts.state || currentDraft.state,
        streetAddress: parts.streetAddress || currentDraft.streetAddress,
        zip: parts.zip || currentDraft.zip,
      };
    }

    const fallbackParts = parseAddressString(addressQuery);
    if (fallbackParts.city || fallbackParts.state || fallbackParts.zip) {
      return {
        ...currentDraft,
        city: fallbackParts.city || currentDraft.city,
        state: fallbackParts.state || currentDraft.state,
        zip: fallbackParts.zip || currentDraft.zip,
      };
    }

    return currentDraft;
  };

  const goNext = async () => {
    let currentDraft = draft;

    if (activeStep === "contact") {
      currentDraft = await ensureValidatedAddress(currentDraft);
      setDraft(currentDraft);
    }

    const nextErrors = getStepErrors(activeStep, currentDraft);

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const nextStep = steps[activeStepIndex + 1];
    if (nextStep) {
      setErrors({});
      setActiveStep(nextStep.id);
    }
  };

  const goBack = () => {
    const previousStep = steps[activeStepIndex - 1];
    if (previousStep) {
      setErrors({});
      setActiveStep(previousStep.id);
    }
  };

  const submitApplication = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = fullApplicationSchema.safeParse(draft);

    if (!result.success) {
      const nextErrors = getFlattenedErrors(result) as FieldErrors;
      setErrors(nextErrors);
      const firstErrorStep = steps.find(({ id }) =>
        Object.keys(getStepErrors(id, draft)).some((key) => key in nextErrors)
      );

      if (firstErrorStep) {
        setActiveStep(firstErrorStep.id);
      }

      return;
    }

    setIsSubmitting(true);

    if (typeof window !== "undefined") {
      const {
        confirmPassword: _confirmPassword,
        password: _password,
        ...applicationForStorage
      } = result.data;
      const fullAppData = {
        ...applicationForStorage,
        paidAmountCents: 5000,
        paidAt: new Date().toISOString(),
        paymentStatus: "paid_express_50",
        termsAcceptedAt: new Date().toISOString(),
      };
      window.sessionStorage.setItem(storageKey, JSON.stringify(fullAppData));
      window.sessionStorage.setItem(
        "better-auth-ui.verify-email",
        result.data.email
      );
    }

    try {
      const response = await fetch(
        new URL("/api/v1/checkout/provider", getServerUrl()),
        {
          body: JSON.stringify({
            email: result.data.email,
            firstName: result.data.firstName,
            lastName: result.data.lastName,
            password: result.data.password,
            plan: result.data.plan,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }
      );

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        url?: string;
      } | null;

      if (!(response.ok && payload?.url)) {
        throw new Error(
          payload?.error ?? "Failed to initiate Stripe Hosted Checkout session."
        );
      }

      window.location.href = payload.url;
    } catch (error) {
      setIsSubmitting(false);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to launch Stripe Checkout."
      );
    }
  };

  const hasVehicleLookupError =
    errors.vehicleMake ?? errors.vehicleModel ?? errors.vehicleYear;
  const selectedVehicleLabel =
    draft.vehicleYear && draft.vehicleMake && draft.vehicleModel
      ? `${draft.vehicleYear} ${draft.vehicleMake} ${draft.vehicleModel}`
      : undefined;

  return (
    <section className="border-t border-white/5 bg-[#080c16] py-20" id="apply">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
        <div className="self-start">
          <p className="text-sm font-bold uppercase text-lime-300">
            Provider onboarding
          </p>
          <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
            Start the application before the heavy paperwork.
          </h2>
          <p className="mt-4 text-base leading-7 text-white/62">
            We collect the basics now: who you are, where you can work, the jobs
            you want, and the vehicle details needed for local dispatch. The
            remaining identity, driving, payment, and quality steps happen after
            your account is created.
          </p>

          <div className="mt-8 grid gap-3">
            {[
              {
                icon: ClipboardList,
                text: "Manual review is supported until provider volume justifies deeper automation.",
              },
              {
                icon: BadgeCheck,
                text: "Free applicants land in a dashboard holding stage with review status and next steps.",
              },
              {
                icon: ShieldCheck,
                text: "CastleCare Pro starts the same flow with priority setup and a one-time $50 upgrade.",
              },
            ].map(({ icon: Icon, text }) => (
              <div
                className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-white/70"
                key={text}
              >
                <Icon
                  aria-hidden="true"
                  className="mt-0.5 size-5 text-lime-300"
                />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>

        <form
          className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-4 shadow-2xl shadow-black/25 sm:p-6"
          onSubmit={submitApplication}
        >
          <div className="grid grid-cols-5 gap-2 rounded-3xl border border-white/10 bg-[#080c16] p-2">
            {steps.map(({ icon: Icon, id, label }, index) => {
              const isActive = id === activeStep;
              const isComplete = index < activeStepIndex;

              return (
                <button
                  className={cn(
                    "flex min-h-16 flex-col items-center justify-center rounded-2xl px-2 text-xs font-bold text-white/40 transition-colors",
                    isActive && "bg-lime-300 text-slate-950",
                    isComplete && "text-lime-200 hover:bg-white/10"
                  )}
                  disabled={index > activeStepIndex}
                  key={id}
                  onClick={() => goToStep(id)}
                  type="button"
                >
                  {isComplete ? (
                    <Check aria-hidden="true" className="mb-1 size-4" />
                  ) : (
                    <Icon aria-hidden="true" className="mb-1 size-4" />
                  )}
                  {label}
                </button>
              );
            })}
          </div>

          <div className="mt-6">
            {activeStep === "contact" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <WizardInput
                  error={errors.firstName}
                  icon={User}
                  id="provider-first-name"
                  label="First name"
                  onChange={updateTextField("firstName")}
                  value={draft.firstName}
                />
                <WizardInput
                  error={errors.lastName}
                  icon={User}
                  id="provider-last-name"
                  label="Last name"
                  onChange={updateTextField("lastName")}
                  value={draft.lastName}
                />
                <WizardInput
                  error={errors.email}
                  icon={Mail}
                  id="provider-email"
                  label="Email"
                  onChange={updateTextField("email")}
                  type="email"
                  value={draft.email}
                />
                <WizardInput
                  error={errors.dateOfBirth}
                  icon={CalendarDays}
                  id="provider-date-of-birth"
                  label="Date of birth"
                  onChange={updateTextField("dateOfBirth")}
                  type="date"
                  value={draft.dateOfBirth}
                />
                <div className="sm:col-span-2">
                  <Label className="text-white/72" htmlFor="provider-address">
                    Home address
                  </Label>
                  <div className="mt-2">
                    <RadarAddressInput
                      error={
                        errors.streetAddress ||
                        errors.city ||
                        errors.state ||
                        errors.zip
                      }
                      isValidated={draft.addressValidated}
                      onChange={updateAddress}
                      onSelectSuggestion={(suggestion) => {
                        void selectAddress(suggestion);
                      }}
                      tone="dark"
                      value={draft.fullAddress || draft.streetAddress}
                    />
                  </div>
                  <FieldError>
                    {errors.streetAddress ||
                      (errors.city || errors.state || errors.zip
                        ? "Select a full address with city, state, and ZIP from the suggestions."
                        : undefined)}
                  </FieldError>
                </div>
                <WizardInput
                  error={errors.unit}
                  icon={Home}
                  id="provider-unit"
                  label="Apt, suite, or unit"
                  onChange={updateTextField("unit")}
                  placeholder="Optional"
                  value={draft.unit}
                />
                <WizardInput
                  error={errors.phone}
                  icon={Phone}
                  id="provider-phone"
                  inputMode="tel"
                  label="Phone"
                  onChange={updatePhone}
                  placeholder="(123) 456-7890"
                  value={draft.phone}
                />
              </div>
            ) : null}

            {activeStep === "services" ? (
              <div className="grid gap-5">
                <button
                  className={cn(
                    "flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left text-white transition-colors",
                    draft.canDoAllServices &&
                      "border-lime-300/60 bg-lime-300/10"
                  )}
                  onClick={toggleAllServices}
                  type="button"
                >
                  <span>
                    <span className="block font-bold">
                      I can do all active services
                    </span>
                    <span className="mt-1 block text-sm text-white/55">
                      Lawn Care, Laundry, and Window Washing.
                    </span>
                  </span>
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full border border-white/20",
                      draft.canDoAllServices &&
                        "border-lime-300 bg-lime-300 text-slate-950"
                    )}
                  >
                    {draft.canDoAllServices ? (
                      <Check aria-hidden="true" className="size-4" />
                    ) : null}
                  </span>
                </button>

                <div className="grid gap-3 md:grid-cols-3">
                  {providerServices.map(({ description, id, label }) => {
                    const isSelected = draft.services.includes(id);

                    return (
                      <button
                        className={cn(
                          "min-h-32 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left transition-colors",
                          isSelected && "border-lime-300/60 bg-lime-300/10"
                        )}
                        key={id}
                        onClick={() => toggleService(id)}
                        type="button"
                      >
                        <span className="flex items-center justify-between">
                          <span className="font-bold text-white">{label}</span>
                          <span
                            className={cn(
                              "flex size-6 items-center justify-center rounded-full border border-white/20 text-slate-950",
                              isSelected && "border-lime-300 bg-lime-300"
                            )}
                          >
                            {isSelected ? (
                              <Check aria-hidden="true" className="size-4" />
                            ) : null}
                          </span>
                        </span>
                        <span className="mt-3 block text-sm leading-6 text-white/55">
                          {description}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <FieldError>{errors.services}</FieldError>

                <div>
                  <Label
                    className="text-white/72"
                    htmlFor="provider-service-notes"
                  >
                    Notes, tools, or experience
                  </Label>
                  <Textarea
                    aria-invalid={errors.serviceNotes ? true : undefined}
                    className="mt-2 min-h-28 rounded-2xl border-white/10 bg-white/[0.06] text-white placeholder:text-white/30"
                    id="provider-service-notes"
                    onChange={updateTextField("serviceNotes")}
                    placeholder="Tell us what you have, what you prefer, and anything we should know before dispatch."
                    value={draft.serviceNotes}
                  />
                  <FieldError>{errors.serviceNotes}</FieldError>
                </div>

                {draft.services.includes("lawncare") ? (
                  <div className="grid gap-3 rounded-2xl border border-lime-300/20 bg-lime-300/10 p-4">
                    <div>
                      <Label htmlFor="provider-mower-access">
                        Do you own or have access to a mower?
                      </Label>
                      <select
                        className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-slate-950 px-3 text-sm text-white"
                        id="provider-mower-access"
                        onChange={(event) =>
                          updateDraft(
                            "mowerAccess",
                            event.target
                              .value as ProviderApplicationDraft["mowerAccess"]
                          )
                        }
                        value={draft.mowerAccess}
                      >
                        <option value="">Choose one</option>
                        <option value="yes">Yes, I can use a mower</option>
                        <option value="no">
                          Not yet, I need equipment guidance
                        </option>
                      </select>
                      <FieldError>{errors.mowerAccess}</FieldError>
                    </div>
                    {draft.mowerAccess === "yes" ? (
                      <div>
                        <Label htmlFor="provider-mower-type">Mower type</Label>
                        <select
                          className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-slate-950 px-3 text-sm text-white"
                          id="provider-mower-type"
                          onChange={(event) =>
                            updateDraft(
                              "mowerType",
                              event.target
                                .value as ProviderApplicationDraft["mowerType"]
                            )
                          }
                          value={draft.mowerType}
                        >
                          <option value="">Choose one</option>
                          <option value="push">Push mower</option>
                          <option value="riding">Riding mower</option>
                          <option value="commercial">Commercial mower</option>
                        </select>
                        <FieldError>{errors.mowerType}</FieldError>
                      </div>
                    ) : null}
                    <p className="text-xs leading-5 text-white/60">
                      You can start with equipment you own or can reliably
                      access; CastleCare will review fit and local equipment
                      options.
                    </p>
                  </div>
                ) : null}

                {draft.services.includes("window-washing") ? (
                  <div className="grid gap-3 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4">
                    <Label htmlFor="provider-window-tools">
                      Can you access a squeegee and safe ladder?
                    </Label>
                    <select
                      className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950 px-3 text-sm text-white"
                      id="provider-window-tools"
                      onChange={(event) =>
                        updateDraft(
                          "windowToolsAccess",
                          event.target
                            .value as ProviderApplicationDraft["windowToolsAccess"]
                        )
                      }
                      value={draft.windowToolsAccess}
                    >
                      <option value="">Choose one</option>
                      <option value="yes">Yes, I have access</option>
                      <option value="no">Not yet, I need guidance</option>
                    </select>
                    <FieldError>{errors.windowToolsAccess}</FieldError>
                    <p className="text-xs leading-5 text-white/60">
                      We will provide a recommended tool list before your first
                      window route.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeStep === "vehicle" ? (
              <div className="grid gap-4">
                <button
                  className={cn(
                    "flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left text-white transition-colors",
                    draft.hasVehicle && "border-lime-300/60 bg-lime-300/10"
                  )}
                  onClick={() => updateDraft("hasVehicle", !draft.hasVehicle)}
                  type="button"
                >
                  <span>
                    <span className="block font-bold">
                      I have reliable transportation
                    </span>
                    <span className="mt-1 block text-sm text-white/55">
                      Vehicle details help us match driving routes and service
                      zones.
                    </span>
                  </span>
                  <Car aria-hidden="true" className="size-5 text-lime-300" />
                </button>

                <div className="grid gap-4 sm:grid-cols-2">
                  <VehicleLookup
                    error={hasVehicleLookupError}
                    onClear={clearVehicleSelection}
                    onSelect={selectVehicle}
                    selectedLabel={selectedVehicleLabel}
                  />
                  <WizardInput
                    error={errors.vehicleColor}
                    icon={Car}
                    id="vehicle-color"
                    label="Color"
                    onChange={updateTextField("vehicleColor")}
                    value={draft.vehicleColor}
                  />
                  <WizardInput
                    error={errors.licensePlate}
                    icon={Car}
                    id="vehicle-plate"
                    label="License plate (optional)"
                    onChange={updateTextField("licensePlate")}
                    placeholder="Can be added later"
                    value={draft.licensePlate}
                  />
                  <WizardInput
                    error={errors.vin}
                    icon={ShieldCheck}
                    id="vehicle-vin"
                    label="VIN (optional)"
                    maxLength={17}
                    minLength={17}
                    onChange={(event) =>
                      updateDraft("vin", event.target.value.toUpperCase())
                    }
                    placeholder="Can be added later"
                    value={draft.vin}
                  />
                  <WizardInput
                    error={errors.serviceRadiusMiles}
                    icon={MapPin}
                    id="provider-radius"
                    inputMode="numeric"
                    label="Service radius in miles"
                    onChange={updateTextField("serviceRadiusMiles")}
                    value={draft.serviceRadiusMiles}
                  />
                </div>

                <div>
                  <Label className="text-white/72">Days you can work</Label>
                  <p className="mt-1 text-sm text-white/45">
                    CastleCare runs 6 AM to 6 PM every day. For now, just pick
                    the days that usually work for you.
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {availabilityDays.map((day) => {
                      const isSelected = draft.availableDays.includes(day.id);

                      return (
                        <label
                          className={cn(
                            "flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-bold text-white/70 transition-colors",
                            isSelected &&
                              "border-lime-300/60 bg-lime-300/10 text-lime-100"
                          )}
                          htmlFor={`provider-availability-${day.id}`}
                          key={day.id}
                        >
                          <Checkbox
                            checked={isSelected}
                            className="rounded-md border-white/20 data-checked:border-lime-300 data-checked:bg-lime-300 data-checked:text-slate-950"
                            id={`provider-availability-${day.id}`}
                            onCheckedChange={() =>
                              toggleAvailabilityDay(day.id)
                            }
                          />
                          {day.label}
                        </label>
                      );
                    })}
                  </div>
                  <FieldError>{errors.availableDays}</FieldError>
                </div>
              </div>
            ) : null}

            {activeStep === "plan" ? (
              <div className="grid gap-6">
                <div className="mx-auto max-w-lg text-center">
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-lime-300/30 bg-lime-300/10 px-3.5 py-1 text-xs font-bold tracking-wider text-lime-300 uppercase">
                    <Sparkles className="size-3.5" />
                    CastleCare Pro Membership
                  </div>
                  <h3 className="mt-3 text-2xl font-extrabold text-white">
                    Express Onboarding & Guaranteed Route Blocks
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-white/70">
                    One-time $50 express setup includes same-day background and
                    MVR screening. Starts at 60/40 payout split on day one with
                    performance progression up to 80/20.
                  </p>
                </div>

                <div className="mx-auto w-full max-w-md">
                  {planOptions.map((option) => {
                    const isSelected = draft.plan === option.id;

                    return (
                      <button
                        className={cn(
                          "w-full rounded-3xl border border-lime-300/50 bg-slate-900/90 p-6 text-left shadow-xl transition-all duration-200 hover:border-lime-300",
                          isSelected &&
                            "border-2 border-lime-300 bg-lime-300/10 ring-2 ring-lime-300/30"
                        )}
                        key={option.id}
                        onClick={() => updateDraft("plan", option.id)}
                        type="button"
                      >
                        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
                          <div>
                            <span className="block text-xl font-bold text-white">
                              {option.label}
                            </span>
                            <span className="mt-1 block text-4xl font-black text-white">
                              {option.price}
                            </span>
                          </div>
                          <span className="flex size-8 items-center justify-center rounded-full border border-lime-300 bg-lime-300 text-slate-950">
                            <Check
                              aria-hidden="true"
                              className="size-5 font-bold"
                            />
                          </span>
                        </div>
                        <div className="mt-4">
                          <span className="block text-xs font-semibold tracking-wider text-white/50 uppercase">
                            Payout Split Progression
                          </span>
                          <span className="mt-1 block text-2xl font-extrabold text-lime-300">
                            {option.split}
                          </span>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-white/70">
                          {option.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
                <FieldError>{errors.plan}</FieldError>
              </div>
            ) : null}

            {activeStep === "account" ? (
              <div className="grid gap-5">
                <div className="rounded-2xl border border-lime-300/20 bg-lime-300/10 p-4 text-sm leading-6 text-lime-100">
                  <Lock
                    aria-hidden="true"
                    className="mb-2 size-5 text-lime-300"
                  />
                  Create secure login credentials for your provider account. In
                  the next final step, you will authorize your $50 background
                  check fee to activate status tracking.
                </div>

                <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/65 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-bold uppercase text-white/40">
                      Applicant Name
                    </p>
                    <p className="mt-1 font-bold text-white">
                      {[draft.firstName, draft.lastName]
                        .filter(Boolean)
                        .join(" ") || "Name pending"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase text-white/40">
                      Email
                    </p>
                    <p className="mt-1 font-bold text-white">
                      {draft.email || "Email pending"}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <WizardInput
                    error={errors.password}
                    icon={Lock}
                    id="provider-password"
                    label="Password"
                    onChange={updateTextField("password")}
                    type="password"
                    value={draft.password}
                  />
                  <WizardInput
                    error={errors.confirmPassword}
                    icon={Lock}
                    id="provider-confirm-password"
                    label="Confirm password"
                    onChange={updateTextField("confirmPassword")}
                    type="password"
                    value={draft.confirmPassword}
                  />
                </div>

                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-white/65 transition-colors",
                    draft.termsAccepted &&
                      "border-lime-300/60 bg-lime-300/10 text-lime-100"
                  )}
                  htmlFor="provider-terms"
                >
                  <Checkbox
                    aria-invalid={errors.termsAccepted ? true : undefined}
                    checked={draft.termsAccepted}
                    className="mt-1 rounded-md border-white/20 data-checked:border-lime-300 data-checked:bg-lime-300 data-checked:text-slate-950"
                    id="provider-terms"
                    onCheckedChange={(checked) =>
                      updateDraft("termsAccepted", checked === true)
                    }
                  />
                  <span>
                    I agree to the{" "}
                    <a
                      className="font-bold text-lime-300 underline hover:text-lime-200"
                      href="/terms"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      CastleCare Provider Terms of Service
                    </a>
                    , background & MVR check authorization, customer privacy
                    expectations, and 1099 Independent Contractor Agreement.
                  </span>
                </label>
                <FieldError>{errors.termsAccepted}</FieldError>
              </div>
            ) : null}
          </div>

          <div className="mt-8 flex flex-col-reverse gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <Button
              className="h-11 rounded-full border-white/15 bg-transparent text-white hover:bg-white/10"
              disabled={activeStepIndex === 0 || isSubmitting}
              onClick={goBack}
              type="button"
              variant="outline"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              Back
            </Button>

            {activeStep === "plan" ? (
              <Button
                className="h-11 rounded-full bg-lime-300 px-6 font-bold text-slate-950 hover:bg-lime-200"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 animate-spin"
                  />
                ) : null}
                Authorize $50 & Create Account
                <ArrowRight aria-hidden="true" className="size-4" />
              </Button>
            ) : (
              <Button
                className="h-11 rounded-full bg-lime-300 px-6 font-bold text-slate-950 hover:bg-lime-200"
                onClick={goNext}
                type="button"
              >
                Continue
                <ArrowRight aria-hidden="true" className="size-4" />
              </Button>
            )}
          </div>

          <p className="mt-4 text-center text-xs text-white/45">
            Selected path: {selectedPlan.label}. No SSN is collected in this
            application.
          </p>
        </form>
      </div>
    </section>
  );
}

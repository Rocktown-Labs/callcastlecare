import type { HomeConfiguration } from "./homes";

export const TimingType = {
  Asap: "asap",
  Scheduled: "scheduled",
} as const;
export type TimingType = (typeof TimingType)[keyof typeof TimingType];

export const CheckoutItemKind = {
  HomePreorder: "home_preorder",
  Laundry: "laundry",
  Lawncare: "lawncare",
  WindowWashing: "window_washing",
} as const;
export type CheckoutItemKind =
  (typeof CheckoutItemKind)[keyof typeof CheckoutItemKind];

export const ServiceType = {
  Laundry: "laundry",
  Lawncare: "lawncare",
  WindowWashing: "window_washing",
} as const;
export type ServiceType = (typeof ServiceType)[keyof typeof ServiceType];

export const OrderStatus = {
  Arrived: "arrived",
  Assigned: "assigned",
  Cancelled: "cancelled",
  Completed: "completed",
  Dispatching: "dispatching",
  Draft: "draft",
  EnRoute: "en_route",
  Failed: "failed",
  InProgress: "in_progress",
  Paid: "paid",
  PendingPayment: "pending_payment",
  Quoted: "quoted",
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const CustomerOrderPhase = {
  Arrived: "arrived",
  AwaitingPayment: "awaiting_payment",
  Cancelled: "cancelled",
  Completed: "completed",
  Failed: "failed",
  FindingProvider: "finding_provider",
  InProgress: "in_progress",
  OnTheWay: "on_the_way",
} as const;
export type CustomerOrderPhase =
  (typeof CustomerOrderPhase)[keyof typeof CustomerOrderPhase];

export interface CheckoutPreviewItemInput {
  itemKind: CheckoutItemKind;
  planId?: string;
  homeQuoteId?: number;
  homeConfiguration?: HomeConfiguration;
  scheduledStartAt?: string;
  scheduledEndAt?: string;
  timingType?: TimingType;
  tipAmountCents?: number;
  // Window Washing parameters
  livingArea?: number;
  stories?: number;
  packageType?: "EXTERIOR_ONLY" | "FULL_SERVICE";
  cleanScreens?: boolean;
  propertyType?: "residential" | "commercial";
  paneCount?: number;
  grassHeight?: "low" | "medium" | "tall";
  hasPets?: "yes" | "no";
  obstacles?: string;
  bedding?: "none" | "with-bedding";
  pickupMode?: "outside" | "knock";
  serviceDetails?: {
    laundry?: {
      bedding?: "none" | "with-bedding";
      pickupMode?: "outside" | "knock";
    };
    lawncare?: {
      grassHeight?: "low" | "medium" | "tall";
      hasPets?: "yes" | "no";
      obstacles?: string;
    };
    window_washing?: {
      cleaningScope?: "exterior" | "both";
      windowEstimate?: string;
    };
  };
  siteNotes?: string;
  isSubscription?: boolean;
  frequency?: "one_time" | "bi_weekly" | "weekly" | "monthly";
}

export interface CheckoutPreviewRequest {
  address?: string;
  addressId?: number;
  items: CheckoutPreviewItemInput[];
  tipAmountCents?: number;
  travelDistanceMiles?: number;
  travelFeeCents?: number;
  travelStateCode?: string;
}

export interface CheckoutPreviewLineItem {
  basePriceCents: number;
  itemKind: CheckoutItemKind;
  label: string;
  metadata: Record<string, unknown>;
  planId?: string;
  quantity: number;
  tipAmountCents: number;
  totalPriceCents: number;
}

export interface CheckoutPreviewResponse {
  address: string | null;
  addressId: number | null;
  lineItems: CheckoutPreviewLineItem[];
  subtotalCents: number;
  tipAmountCents: number;
  totalCents: number;
  travelFeeCents: number;
}

export interface CheckoutConfirmRequest extends CheckoutPreviewRequest {
  contact: {
    email: string;
    name: string;
    phone: string;
  };
  paymentOption: "deposit_cash" | "deposit_invoice" | "pay_full";
  paymentMethodId?: string;
}

export interface CheckoutConfirmResponse {
  checkoutSessionId: number;
  clientSecret?: string;
  checkoutUrl?: string;
  paymentIntentId?: string;
  stripeCheckoutSessionId?: string;
  status: "pending_payment" | "paid";
}

export interface CheckoutSessionStatusResponse {
  checkoutSessionId: number;
  createdOrderIds: number[];
  status: "draft" | "pending_payment" | "paid" | "failed" | "cancelled";
}

export interface CheckoutDraftRequest {
  payload: Record<string, unknown>;
}

export interface CheckoutDraftResponse {
  checkoutDraftId: number;
  payload: Record<string, unknown>;
  updatedAt: string;
}

export interface CustomerProfileResponse {
  customer: {
    email: string;
    firstName: string;
    id: number;
    lastName: string;
    phone: string | null;
    userId: string;
  };
}

export interface UpdateCustomerProfileRequest {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
}

export interface AddressRecord {
  city: string;
  country: string;
  createdAt: string;
  customerId: number;
  formattedAddress: string | null;
  id: number;
  instructions: string | null;
  isDefault: boolean;
  isValidated: boolean;
  label: string;
  latitude: number | null;
  longitude: number | null;
  state: string;
  street: string;
  updatedAt: string;
  zip: string;
}

export interface AddressListResponse {
  addresses: AddressRecord[];
}

export interface UpsertAddressRequest {
  address?: string;
  city?: string;
  country?: string;
  formattedAddress?: string;
  instructions?: string | null;
  isDefault?: boolean;
  label?: string;
  latitude?: number | null;
  longitude?: number | null;
  state?: string;
  street?: string;
  zip?: string;
}

export interface UpsertAddressResponse {
  address: AddressRecord;
}

export interface UpdateAddressRequest {
  instructions?: string | null;
  isDefault?: boolean;
  label?: string;
}

export interface CustomerOrderTimelineEntry {
  at: string;
  key:
    | "pending_payment"
    | "paid"
    | "dispatching"
    | "assigned"
    | "en_route"
    | "arrived"
    | "in_progress"
    | "completed"
    | "cancelled"
    | "failed";
  label: string;
  note: string | null;
}

export interface OrderTrackingPoint {
  accuracyMeters: number | null;
  capturedAt: string;
  heading: number | null;
  latitude: number;
  longitude: number;
  speedMps: number | null;
}

export interface OrderStatusResponse {
  activeTracking: {
    isStale: boolean;
    point: OrderTrackingPoint | null;
    staleAfterSeconds: number;
  };
  address: {
    formattedAddress: string | null;
    id: number;
    latitude: number | null;
    longitude: number | null;
  };
  order: {
    id: number;
    phase: CustomerOrderPhase;
    serviceType: ServiceType;
    status: OrderStatus;
    totalPriceCents: number;
  };
  timeline: CustomerOrderTimelineEntry[];
}

export interface HomeQuoteRequest {
  address: string;
}

export interface HomeQuoteResponse {
  confidenceScore: number | null;
  fallbackUsed: boolean;
  homeQuoteId: number;
  homeSqft: number | null;
  lotSizeSqft: number | null;
  pricingTier: "small" | "medium" | "large";
  totalPriceCents: number;
}

export interface MediaUploadUrlRequest {
  contentType: string;
  mediaType:
    | "lawncare_before"
    | "lawncare_after"
    | "laundry_pickup"
    | "laundry_scan"
    | "laundry_folded"
    | "laundry_dropoff";
  orderId?: number;
  legId?: number;
}

export interface MediaUploadUrlResponse {
  storagePath: string;
  uploadUrl: string;
}

export interface MediaAttachRequest {
  legId?: number;
  mediaType:
    | "lawncare_before"
    | "lawncare_after"
    | "laundry_pickup"
    | "laundry_scan"
    | "laundry_folded"
    | "laundry_dropoff";
  metadata?: Record<string, unknown>;
  orderId?: number;
  requiredForTransition?: string;
  storagePath: string;
}

export interface OrderListResponseItem {
  assignedWorkerId: number | null;
  autoRescheduledAt: string | null;
  createdAt: string;
  dispatchBonusCents: number;
  dispatchStartedAt: string | null;
  id: number;
  nextWaveAt: string | null;
  scheduledStartAt: string | null;
  serviceType: ServiceType;
  status: OrderStatus;
  timingType: TimingType;
  totalPriceCents: number;
}

export interface OrdersListResponse {
  orders: OrderListResponseItem[];
}

export interface NotificationListResponseItem {
  body: string;
  channel: "push" | "sms" | "email" | "in_app";
  createdAt: string;
  id: number;
  orderId: number | null;
  readAt: string | null;
  status: "queued" | "sending" | "sent" | "delivered" | "failed";
  subject: string | null;
}

export interface NotificationsListResponse {
  notifications: NotificationListResponseItem[];
}

export interface DriverOfferDecisionResponse {
  ok: true;
}

export interface DriverOrderTransitionResponse {
  ok: true;
}

export interface DriverLocationHeartbeatRequest {
  accuracyMeters?: number | null;
  capturedAt?: string;
  heading?: number | null;
  latitude: number;
  longitude: number;
  orderId?: number;
  speedMps?: number | null;
}

export interface DriverLocationHeartbeatResponse {
  ok: true;
}

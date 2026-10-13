export type ServiceType = "lawncare" | "laundry" | "window_washing";

export type OrderStatus =
  | "assigned"
  | "dispatching"
  | "en_route"
  | "arrived"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface ServiceTask {
  id: string;
  label: string;
  completed: boolean;
}

export interface DispatchOffer {
  id: number;
  orderId: number;
  serviceType: ServiceType;
  title: string;
  subtitle: string;
  totalPayoutCents: number;
  basePayCents: number;
  tipAmountCents: number;
  durationMinutes: number;
  distanceMiles: number;
  stopsCount: number;
  pickupTime: string;
  customerName: string;
  customerPhone: string;
  address: string;
  city: string;
  zip: string;
  propertyNotes: string;
  serviceDetails: {
    lawnHeight?: "low" | "medium" | "tall";
    lotSize?: string;
    stories?: number;
    windowEstimate?: number;
    beddingIncluded?: boolean;
    bagsCount?: number;
  };
  expiresAt: string;
}

export interface ActiveJob {
  orderId: number;
  offerId: number;
  serviceType: ServiceType;
  customerName: string;
  customerPhone: string;
  address: string;
  city: string;
  zip: string;
  gateCode?: string;
  specialInstructions?: string;
  status: OrderStatus;
  totalPayoutCents: number;
  basePayCents: number;
  tipAmountCents: number;
  distanceMiles: number;
  scheduledTime: string;
  serviceDetails: DispatchOffer["serviceDetails"];
  beforePhotos: string[];
  afterPhotos: string[];
  tasks: ServiceTask[];
  arrivedAt?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface TripRecord {
  id: string;
  orderNumber: string;
  dateLabel: string;
  serviceType: ServiceType;
  serviceTitle: string;
  status: "completed" | "cancelled";
  payoutCents: number;
  basePayCents: number;
  tipCents: number;
  timeLabel: string;
  address: string;
  durationLabel: string;
  itemsSummary: string;
}

export interface DailyEarnings {
  dayName: string;
  dayNumber: number;
  dateKey: string;
  amountCents: number;
  tripEarningsCents: number;
  tipsCents: number;
  tripsCount: number;
}

export interface WeekEarningsSummary {
  id: string;
  dateRangeLabel: string;
  totalCents: number;
  isCurrentWeek?: boolean;
  days: DailyEarnings[];
}

export interface IncentiveBonus {
  id: string;
  title: string;
  amountCents: number;
  subtitle: string;
  progressCount: number;
  targetCount: number;
  eligibleTimeRange: string;
  status: "active" | "completed" | "expired";
  serviceCategory: string;
}

export interface DriverMetrics {
  currentTier: "Silver" | "Gold" | "Sapphire" | "Crown";
  pointsThisMonth: number;
  silverThreshold: number;
  goldThreshold: number;
  sapphireThreshold: number;
  crownThreshold: number;
  onTimeArrivalPercent: number;
  completionRatePercent: number;
  customerRating: number;
  totalTripsCompleted: number;
}

export interface DeliveryZone {
  id: string;
  name: string;
  pickupPointsCount: number;
  zipCodes: string[];
  isCurrent?: boolean;
}

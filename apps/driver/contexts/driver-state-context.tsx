import * as Haptics from "expo-haptics";
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import {
  SAMPLE_CURRENT_WEEK,
  SAMPLE_DRIVER_METRICS,
  SAMPLE_INCENTIVES,
  SAMPLE_LAUNDRY_OFFER,
  SAMPLE_OFFER,
  SAMPLE_PAST_WEEKS,
  SAMPLE_TRIPS_HISTORY,
  SAMPLE_WINDOW_OFFER,
  SAMPLE_ZONES,
} from "@/lib/mock-data";
import type {
  ActiveJob,
  DeliveryZone,
  DispatchOffer,
  DriverMetrics,
  IncentiveBonus,
  ServiceTask,
  TripRecord,
  WeekEarningsSummary,
} from "@/lib/types";

interface DriverStateContextType {
  isOnline: boolean;
  currentZone: DeliveryZone;
  availableZones: DeliveryZone[];
  currentOffer: DispatchOffer | null;
  activeJob: ActiveJob | null;
  tripsHistory: TripRecord[];
  currentWeekEarnings: WeekEarningsSummary;
  pastWeeksEarnings: WeekEarningsSummary[];
  incentives: IncentiveBonus[];
  metrics: DriverMetrics;
  lastCompletedJob: ActiveJob | null;
  toggleOnline: () => void;
  setZone: (zoneId: string) => void;
  triggerMockOffer: (type?: "lawncare" | "window_washing" | "laundry") => void;
  acceptOffer: (offer: DispatchOffer) => void;
  declineOffer: () => void;
  startTrip: () => void;
  confirmArrival: () => void;
  addBeforePhoto: (photoUri: string) => void;
  removeBeforePhoto: (index: number) => void;
  startService: () => boolean;
  toggleTask: (taskId: string) => void;
  addAfterPhoto: (photoUri: string) => void;
  removeAfterPhoto: (index: number) => void;
  completeJob: (notes?: string) => boolean;
  dismissCompletedJob: () => void;
}

const DriverStateContext = createContext<DriverStateContextType | undefined>(
  undefined
);

const DEFAULT_TASKS_FOR_SERVICE = (
  serviceType: "lawncare" | "laundry" | "window_washing"
): ServiceTask[] => {
  if (serviceType === "lawncare") {
    return [
      {
        completed: false,
        id: "task-1",
        label: "Inspect yard for debris, pets, & toys",
      },
      {
        completed: false,
        id: "task-2",
        label: "Mow front & backyard (3.5 inch cut)",
      },
      {
        completed: false,
        id: "task-3",
        label: "Perimeter string-trimming & sidewalk edging",
      },
      {
        completed: false,
        id: "task-4",
        label: "Blow clippings off driveway, porch, & paths",
      },
      { completed: false, id: "task-5", label: "Close and secure all gates" },
    ];
  }
  if (serviceType === "window_washing") {
    return [
      {
        completed: false,
        id: "task-1",
        label: "Clear window sills & remove screens safely",
      },
      {
        completed: false,
        id: "task-2",
        label: "Exterior pure-water brush & high wash",
      },
      {
        completed: false,
        id: "task-3",
        label: "Squeegee clean with microfiber edge wipe",
      },
      {
        completed: false,
        id: "task-4",
        label: "Re-install screens and inspect finish",
      },
    ];
  }
  return [
    {
      completed: false,
      id: "task-1",
      label: "Scan CastleCare QR label on laundry bags",
    },
    {
      completed: false,
      id: "task-2",
      label: "Verify count of bags & customer tags",
    },
    {
      completed: false,
      id: "task-3",
      label: "Secure bags into clean transport hamper",
    },
    {
      completed: false,
      id: "task-4",
      label: "Send automated pickup confirmation to customer",
    },
  ];
};

const getCompletedItemSummary = (
  serviceType: "lawncare" | "window_washing" | "laundry"
): string => {
  if (serviceType === "lawncare") {
    return "Lawn Care · Completed";
  }
  if (serviceType === "window_washing") {
    return "Window Washing · Completed";
  }
  return "Laundry · Completed";
};

const getCompletedServiceTitle = (
  serviceType: "lawncare" | "window_washing" | "laundry"
): string => {
  if (serviceType === "lawncare") {
    return "Lawn Care & Edge";
  }
  if (serviceType === "window_washing") {
    return "Window Washing";
  }
  return "Laundry Wash & Fold";
};

export const DriverStateProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [isOnline, setIsOnline] = useState(false);
  const [currentZoneId, setCurrentZoneId] = useState("searcy-ar");
  const [currentOffer, setCurrentOffer] = useState<DispatchOffer | null>(null);
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
  const [lastCompletedJob, setLastCompletedJob] = useState<ActiveJob | null>(
    null
  );
  const [tripsHistory, setTripsHistory] =
    useState<TripRecord[]>(SAMPLE_TRIPS_HISTORY);
  const [currentWeekEarnings, setCurrentWeekEarnings] =
    useState<WeekEarningsSummary>(SAMPLE_CURRENT_WEEK);
  const [metrics, setMetrics] = useState<DriverMetrics>(SAMPLE_DRIVER_METRICS);

  const currentZone = useMemo(
    () =>
      SAMPLE_ZONES.find((zone) => zone.id === currentZoneId) ?? SAMPLE_ZONES[0],
    [currentZoneId]
  );

  const toggleOnline = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsOnline((prev) => {
      const next = !prev;
      if (!next) {
        setCurrentOffer(null);
      }
      return next;
    });
  }, []);

  const setZone = useCallback((zoneId: string) => {
    Haptics.selectionAsync();
    setCurrentZoneId(zoneId);
  }, []);

  const triggerMockOffer = useCallback(
    (type: "lawncare" | "window_washing" | "laundry" = "lawncare") => {
      let offerToTrigger: DispatchOffer = SAMPLE_OFFER;
      if (type === "window_washing") {
        offerToTrigger = SAMPLE_WINDOW_OFFER;
      } else if (type === "laundry") {
        offerToTrigger = SAMPLE_LAUNDRY_OFFER;
      }
      setCurrentOffer({
        ...offerToTrigger,
        expiresAt: new Date(Date.now() + 60 * 1000).toISOString(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    },
    []
  );

  const acceptOffer = useCallback((offer: DispatchOffer) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const newJob: ActiveJob = {
      address: `${offer.address}, ${offer.city}`,
      afterPhotos: [],
      basePayCents: offer.basePayCents,
      beforePhotos: [],
      city: offer.city,
      customerName: offer.customerName,
      customerPhone: offer.customerPhone,
      distanceMiles: offer.distanceMiles,
      gateCode: "#4412",
      offerId: offer.id,
      orderId: offer.orderId,
      scheduledTime: offer.pickupTime,
      serviceDetails: offer.serviceDetails,
      serviceType: offer.serviceType,
      specialInstructions: offer.propertyNotes,
      status: "assigned",
      tasks: DEFAULT_TASKS_FOR_SERVICE(offer.serviceType),
      tipAmountCents: offer.tipAmountCents,
      totalPayoutCents: offer.totalPayoutCents,
      zip: offer.zip,
    };
    setActiveJob(newJob);
    setCurrentOffer(null);
  }, []);

  const declineOffer = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentOffer(null);
  }, []);

  const startTrip = useCallback(() => {
    if (!activeJob) {
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActiveJob((prev) => (prev ? { ...prev, status: "en_route" } : null));
  }, [activeJob]);

  const confirmArrival = useCallback(() => {
    if (!activeJob) {
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setActiveJob((prev) =>
      prev
        ? {
            ...prev,
            arrivedAt: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            status: "arrived",
          }
        : null
    );
  }, [activeJob]);

  const addBeforePhoto = useCallback((photoUri: string) => {
    Haptics.selectionAsync();
    setActiveJob((prev) =>
      prev ? { ...prev, beforePhotos: [...prev.beforePhotos, photoUri] } : null
    );
  }, []);

  const removeBeforePhoto = useCallback((index: number) => {
    Haptics.selectionAsync();
    setActiveJob((prev) =>
      prev
        ? {
            ...prev,
            beforePhotos: prev.beforePhotos.filter((_, i) => i !== index),
          }
        : null
    );
  }, []);

  const startService = useCallback((): boolean => {
    if (!activeJob) {
      return false;
    }
    if (activeJob.beforePhotos.length === 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return false;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setActiveJob((prev) =>
      prev
        ? {
            ...prev,
            startedAt: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            status: "in_progress",
          }
        : null
    );
    return true;
  }, [activeJob]);

  const toggleTask = useCallback((taskId: string) => {
    Haptics.selectionAsync();
    setActiveJob((prev) => {
      if (!prev) {
        return null;
      }
      return {
        ...prev,
        tasks: prev.tasks.map((task) =>
          task.id === taskId ? { ...task, completed: !task.completed } : task
        ),
      };
    });
  }, []);

  const addAfterPhoto = useCallback((photoUri: string) => {
    Haptics.selectionAsync();
    setActiveJob((prev) =>
      prev ? { ...prev, afterPhotos: [...prev.afterPhotos, photoUri] } : null
    );
  }, []);

  const removeAfterPhoto = useCallback((index: number) => {
    Haptics.selectionAsync();
    setActiveJob((prev) =>
      prev
        ? {
            ...prev,
            afterPhotos: prev.afterPhotos.filter((_, i) => i !== index),
          }
        : null
    );
  }, []);

  const completeJob = useCallback(
    (_notes?: string): boolean => {
      if (!activeJob) {
        return false;
      }
      if (activeJob.afterPhotos.length === 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return false;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const finishedJob: ActiveJob = {
        ...activeJob,
        completedAt: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        status: "completed",
      };

      const newTripRecord: TripRecord = {
        address: finishedJob.address,
        basePayCents: finishedJob.basePayCents,
        dateLabel: "Today",
        durationLabel: "1 hr 10 mins",
        id: `trip-${finishedJob.orderId}`,
        itemsSummary: getCompletedItemSummary(finishedJob.serviceType),
        orderNumber: `#${finishedJob.orderId}`,
        payoutCents: finishedJob.totalPayoutCents,
        serviceTitle: getCompletedServiceTitle(finishedJob.serviceType),
        serviceType: finishedJob.serviceType,
        status: "completed",
        timeLabel: finishedJob.completedAt ?? "Just now",
        tipCents: finishedJob.tipAmountCents,
      };

      setTripsHistory((prev) => [newTripRecord, ...prev]);

      setCurrentWeekEarnings((prev) => ({
        ...prev,
        days: prev.days.map((day, idx) =>
          idx === 3
            ? {
                ...day,
                amountCents: day.amountCents + finishedJob.totalPayoutCents,
                tipsCents: day.tipsCents + finishedJob.tipAmountCents,
                tripEarningsCents:
                  day.tripEarningsCents + finishedJob.basePayCents,
                tripsCount: day.tripsCount + 1,
              }
            : day
        ),
        totalCents: prev.totalCents + finishedJob.totalPayoutCents,
      }));

      setMetrics((prev) => ({
        ...prev,
        pointsThisMonth: prev.pointsThisMonth + 3,
        totalTripsCompleted: prev.totalTripsCompleted + 1,
      }));

      setLastCompletedJob(finishedJob);
      setActiveJob(null);
      return true;
    },
    [activeJob]
  );

  const dismissCompletedJob = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLastCompletedJob(null);
  }, []);

  const contextValue = useMemo(
    () => ({
      acceptOffer,
      activeJob,
      addAfterPhoto,
      addBeforePhoto,
      availableZones: SAMPLE_ZONES,
      completeJob,
      confirmArrival,
      currentOffer,
      currentWeekEarnings,
      currentZone,
      declineOffer,
      dismissCompletedJob,
      incentives: SAMPLE_INCENTIVES,
      isOnline,
      lastCompletedJob,
      metrics,
      pastWeeksEarnings: SAMPLE_PAST_WEEKS,
      removeAfterPhoto,
      removeBeforePhoto,
      setZone,
      startService,
      startTrip,
      toggleOnline,
      toggleTask,
      triggerMockOffer,
      tripsHistory,
    }),
    [
      acceptOffer,
      activeJob,
      addAfterPhoto,
      addBeforePhoto,
      completeJob,
      confirmArrival,
      currentOffer,
      currentWeekEarnings,
      currentZone,
      declineOffer,
      dismissCompletedJob,
      isOnline,
      lastCompletedJob,
      metrics,
      removeAfterPhoto,
      removeBeforePhoto,
      setZone,
      startService,
      startTrip,
      toggleOnline,
      toggleTask,
      triggerMockOffer,
      tripsHistory,
    ]
  );

  return (
    <DriverStateContext.Provider value={contextValue}>
      {children}
    </DriverStateContext.Provider>
  );
};

export const useDriverState = () => {
  const context = useContext(DriverStateContext);
  if (!context) {
    throw new Error("useDriverState must be used within DriverStateProvider");
  }
  return context;
};

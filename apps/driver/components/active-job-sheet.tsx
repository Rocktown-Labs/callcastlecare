import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useDriverState } from "@/contexts/driver-state-context";
import type { ActiveJob } from "@/lib/types";

import { PhotoCaptureSlot } from "./photo-capture-slot";
import { SwipeActionButton } from "./swipe-action-button";

const styles = StyleSheet.create({
  actionSection: {
    marginTop: 14,
  },
  addressRow: {
    alignItems: "center",
    flexDirection: "row",
    marginTop: 12,
  },
  addressText: {
    color: "#1E293B",
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 18,
  },
  buttonDisabled: {
    backgroundColor: "#94A3B8",
    opacity: 0.6,
  },
  callButton: {
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderRadius: 8,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  callButtonText: {
    color: "#0058B8",
    fontSize: 12,
    fontWeight: "600",
  },
  celebrationCircle: {
    alignItems: "center",
    backgroundColor: "#10B981",
    borderRadius: 38,
    height: 76,
    justifyContent: "center",
    marginBottom: 14,
    width: 76,
  },
  celebrationSub: {
    color: "#64748B",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
    textAlign: "center",
  },
  celebrationTitle: {
    color: "#0F172A",
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 6,
  },
  checkItemLabel: {
    color: "#334155",
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
  },
  checkItemLabelDone: {
    color: "#94A3B8",
    textDecorationLine: "line-through",
  },
  checkItemRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  checklistCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16,
  },
  checklistTitle: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 12,
  },
  completedCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 12,
    padding: 24,
  },
  contactDetailsRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  customerCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  customerHeaderRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  customerInfoCol: {
    flex: 1,
    marginRight: 8,
  },
  customerName: {
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "700",
  },
  dotBlue: {
    backgroundColor: "#0058B8",
  },
  dotGreen: {
    backgroundColor: "#10B981",
  },
  gateCodeBadge: {
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    borderRadius: 8,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  gateCodeText: {
    color: "#92400E",
    fontSize: 12,
    fontWeight: "600",
  },
  inputLabel: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },
  instructionsBox: {
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    flexDirection: "row",
    gap: 6,
    marginTop: 10,
    padding: 8,
  },
  instructionsText: {
    color: "#475569",
    flex: 1,
    fontSize: 12,
  },
  navButton: {
    alignItems: "center",
    backgroundColor: "#0058B8",
    borderRadius: 8,
    flexDirection: "row",
    gap: 4,
    marginLeft: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  navButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  notesInputContainer: {
    marginBottom: 16,
  },
  notesTextInput: {
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 10,
    borderWidth: 1,
    color: "#0F172A",
    fontSize: 14,
    height: 64,
    padding: 10,
    textAlignVertical: "top",
  },
  orderNumberText: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
  },
  payoutBadge: {
    alignItems: "flex-end",
  },
  payoutSub: {
    color: "#64748B",
    fontSize: 10,
  },
  payoutSummaryBox: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
    padding: 16,
    width: "100%",
  },
  payoutValue: {
    color: "#0058B8",
    fontSize: 20,
    fontWeight: "800",
  },
  photosSection: {
    marginBottom: 14,
  },
  pinIcon: {
    marginRight: 6,
  },
  primaryActionButton: {
    alignItems: "center",
    backgroundColor: "#0058B8",
    borderRadius: 28,
    flexDirection: "row",
    gap: 8,
    height: 54,
    justifyContent: "center",
    width: "100%",
  },
  primaryActionText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  returnHomeButton: {
    alignItems: "center",
    backgroundColor: "#0058B8",
    borderRadius: 28,
    height: 52,
    justifyContent: "center",
    width: "100%",
  },
  returnHomeText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  serviceName: {
    color: "#64748B",
    fontSize: 13,
    marginTop: 2,
  },
  sheetContainer: {
    backgroundColor: "#F8FAFC",
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  statusDot: {
    backgroundColor: "#F59E0B",
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  statusPill: {
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderRadius: 14,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillText: {
    color: "#0058B8",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  stepHeading: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "700",
  },
  stepInfoBox: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
    padding: 12,
  },
  stepSub: {
    color: "#1E3A8A",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  summaryDivider: {
    backgroundColor: "#E2E8F0",
    height: 1,
    marginVertical: 10,
  },
  summaryLabel: {
    color: "#64748B",
    fontSize: 13,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  summaryRowTotal: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryValue: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "600",
  },
  swipeNote: {
    color: "#EF4444",
    fontSize: 11,
    fontWeight: "500",
    marginTop: 6,
    textAlign: "center",
  },
  swipeWrapper: {
    marginTop: 6,
  },
  timerBanner: {
    alignItems: "center",
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginBottom: 14,
    padding: 12,
  },
  timerBannerText: {
    color: "#065F46",
    fontSize: 15,
    fontWeight: "700",
  },
  topStatusHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    marginTop: 4,
  },
  totalLabel: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "700",
  },
  totalValue: {
    color: "#0058B8",
    fontSize: 22,
    fontWeight: "800",
  },
});

const SAMPLE_PHOTO_MOCKS = [
  "https://images.unsplash.com/photo-1558904541-efa8c4a56a64?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1592417817098-8f3d69106093?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&auto=format&fit=crop&q=80",
];

const getServiceTitle = (serviceType: string): string => {
  if (serviceType === "lawncare") {
    return "CastleCare Premium Lawn Care";
  }
  if (serviceType === "window_washing") {
    return "Royal Pane Window Washing";
  }
  return "Royal Wash Laundry Pickup";
};

const formatTimer = (totalSec: number): string => {
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins < 10 ? `0${mins}` : mins}:${secs < 10 ? `0${secs}` : secs}`;
};

const getStatusPillText = (status: string, timerText: string): string => {
  switch (status) {
    case "assigned": {
      return "JOB ACCEPTED · READY TO DEPART";
    }
    case "en_route": {
      return "EN ROUTE TO JOB SITE";
    }
    case "arrived": {
      return "ARRIVED · BEFORE PHOTOS";
    }
    case "in_progress": {
      return `IN PROGRESS · ${timerText}`;
    }
    case "completed": {
      return "JOB COMPLETED";
    }
    default: {
      return "ACTIVE DISPATCH";
    }
  }
};

interface ArrivedPhaseProps {
  job: ActiveJob;
  onSimulatePhoto: () => void;
  onRemovePhoto: (index: number) => void;
  onStartService: () => void;
}

const ArrivedPhaseView = ({
  job,
  onRemovePhoto,
  onSimulatePhoto,
  onStartService,
}: ArrivedPhaseProps) => (
  <View style={styles.actionSection}>
    <View style={styles.stepInfoBox}>
      <Text style={styles.stepHeading}>
        Step 3: Capture Required Before Photos
      </Text>
      <Text style={styles.stepSub}>
        CastleCare quality standards require at least 1 verified property before
        photo before starting work.
      </Text>
    </View>

    <View style={styles.photosSection}>
      <PhotoCaptureSlot
        label="Property Front & Turf Condition"
        photoUri={job.beforePhotos[0]}
        onCapture={onSimulatePhoto}
        onRemove={() => onRemovePhoto(0)}
        required
      />
      <PhotoCaptureSlot
        label="Backyard & Perimeter Check"
        photoUri={job.beforePhotos[1]}
        onCapture={onSimulatePhoto}
        onRemove={() => onRemovePhoto(1)}
        required={false}
      />
    </View>

    <Pressable
      style={[
        styles.primaryActionButton,
        job.beforePhotos.length === 0 && styles.buttonDisabled,
      ]}
      onPress={() => {
        if (job.beforePhotos.length === 0) {
          Alert.alert(
            "Photos Required",
            "Please take at least one before photo before starting service."
          );
          return;
        }
        onStartService();
      }}
    >
      <Ionicons name="play" size={20} color="#FFFFFF" />
      <Text style={styles.primaryActionText}>
        {job.beforePhotos.length === 0
          ? "TAKE PHOTOS TO UNLOCK SERVICE"
          : "START SERVICE"}
      </Text>
    </Pressable>
  </View>
);

interface InProgressPhaseProps {
  job: ActiveJob;
  elapsedSeconds: number;
  completionNotes: string;
  setCompletionNotes: (notes: string) => void;
  onToggleTask: (taskId: string) => void;
  onSimulatePhoto: () => void;
  onRemovePhoto: (index: number) => void;
  onCompleteJob: (notes: string) => void;
}

const InProgressPhaseView = ({
  completionNotes,
  elapsedSeconds,
  job,
  onCompleteJob,
  onRemovePhoto,
  onSimulatePhoto,
  onToggleTask,
  setCompletionNotes,
}: InProgressPhaseProps) => (
  <View style={styles.actionSection}>
    <View style={styles.timerBanner}>
      <Ionicons name="stopwatch" size={20} color="#10B981" />
      <Text style={styles.timerBannerText}>
        Active Service Time: {formatTimer(elapsedSeconds)}
      </Text>
    </View>

    <View style={styles.checklistCard}>
      <Text style={styles.checklistTitle}>Service Checklist</Text>
      {job.tasks.map((task) => (
        <Pressable
          key={task.id}
          style={styles.checkItemRow}
          onPress={() => onToggleTask(task.id)}
        >
          <Ionicons
            name={task.completed ? "checkbox" : "square-outline"}
            size={22}
            color={task.completed ? "#0058B8" : "#94A3B8"}
          />
          <Text
            style={[
              styles.checkItemLabel,
              task.completed && styles.checkItemLabelDone,
            ]}
          >
            {task.label}
          </Text>
        </Pressable>
      ))}
    </View>

    <View style={styles.stepInfoBox}>
      <Text style={styles.stepHeading}>Step 4: Take After Photos</Text>
      <Text style={styles.stepSub}>
        Upload clear photos of completed cut, edged borders, or cleaned windows.
      </Text>
    </View>

    <View style={styles.photosSection}>
      <PhotoCaptureSlot
        label="Finished Property Front View"
        photoUri={job.afterPhotos[0]}
        onCapture={onSimulatePhoto}
        onRemove={() => onRemovePhoto(0)}
        required
      />
      <PhotoCaptureSlot
        label="Finished Backyard & Details"
        photoUri={job.afterPhotos[1]}
        onCapture={onSimulatePhoto}
        onRemove={() => onRemovePhoto(1)}
        required={false}
      />
    </View>

    <View style={styles.notesInputContainer}>
      <Text style={styles.inputLabel}>Driver Completion Notes (Optional)</Text>
      <TextInput
        style={styles.notesTextInput}
        placeholder="e.g. Lawn cut cleanly, edging blown, gate secured"
        placeholderTextColor="#94A3B8"
        value={completionNotes}
        onChangeText={setCompletionNotes}
        multiline
      />
    </View>

    <View style={styles.swipeWrapper}>
      <SwipeActionButton
        label="SWIPE TO COMPLETE JOB"
        variant="success"
        disabled={job.afterPhotos.length === 0}
        onConfirm={() => onCompleteJob(completionNotes)}
      />
      {job.afterPhotos.length === 0 && (
        <Text style={styles.swipeNote}>
          * Take at least 1 after photo to enable completion swipe
        </Text>
      )}
    </View>
  </View>
);

interface CompletedSummaryProps {
  job: ActiveJob;
  onDismiss: () => void;
}

const CompletedSummaryView = ({ job, onDismiss }: CompletedSummaryProps) => (
  <View style={styles.completedCard}>
    <View style={styles.celebrationCircle}>
      <Ionicons name="checkmark-done" size={42} color="#FFFFFF" />
    </View>
    <Text style={styles.celebrationTitle}>Job Completed! 🎉</Text>
    <Text style={styles.celebrationSub}>
      Great work! Your payout has been added to your confirmed weekly balance.
    </Text>

    <View style={styles.payoutSummaryBox}>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Base Pay</Text>
        <Text style={styles.summaryValue}>
          ${(job.basePayCents / 100).toFixed(2)}
        </Text>
      </View>
      {job.tipAmountCents > 0 && (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Customer Tip</Text>
          <Text style={styles.summaryValue}>
            ${(job.tipAmountCents / 100).toFixed(2)}
          </Text>
        </View>
      )}
      <View style={styles.summaryDivider} />
      <View style={styles.summaryRowTotal}>
        <Text style={styles.totalLabel}>Total Payout</Text>
        <Text style={styles.totalValue}>
          ${(job.totalPayoutCents / 100).toFixed(2)}
        </Text>
      </View>
    </View>

    <Pressable style={styles.returnHomeButton} onPress={onDismiss}>
      <Text style={styles.returnHomeText}>RETURN TO DISPATCH HOME</Text>
    </Pressable>
  </View>
);

export const ActiveJobSheet = () => {
  const {
    activeJob,
    addAfterPhoto,
    addBeforePhoto,
    completeJob,
    confirmArrival,
    dismissCompletedJob,
    lastCompletedJob,
    removeAfterPhoto,
    removeBeforePhoto,
    startService,
    startTrip,
    toggleTask,
  } = useDriverState();

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [completionNotes, setCompletionNotes] = useState("");

  const job = activeJob ?? lastCompletedJob;

  useEffect(() => {
    if (activeJob?.status !== "in_progress") {
      return;
    }

    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [activeJob?.status]);

  if (!job) {
    return null;
  }

  const handleOpenMaps = async () => {
    try {
      const query = encodeURIComponent(job.address);
      await Linking.openURL(`https://maps.google.com/?q=${query}`);
    } catch {
      Alert.alert("Maps", `Navigating to: ${job.address}`);
    }
  };

  const handleCallCustomer = async () => {
    try {
      await Linking.openURL(`tel:${job.customerPhone}`);
    } catch {
      Alert.alert("Call", `Dialing customer: ${job.customerPhone}`);
    }
  };

  const handleSimulateBeforePhoto = () => {
    const randomPic =
      SAMPLE_PHOTO_MOCKS[job.beforePhotos.length % SAMPLE_PHOTO_MOCKS.length];
    addBeforePhoto(randomPic);
  };

  const handleSimulateAfterPhoto = () => {
    const randomPic =
      SAMPLE_PHOTO_MOCKS[job.afterPhotos.length % SAMPLE_PHOTO_MOCKS.length];
    addAfterPhoto(randomPic);
  };

  return (
    <View style={styles.sheetContainer}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Step indicator header */}
        <View style={styles.topStatusHeader}>
          <View style={styles.statusPill}>
            <View
              style={[
                styles.statusDot,
                job.status === "in_progress" && styles.dotGreen,
                job.status === "completed" && styles.dotBlue,
              ]}
            />
            <Text style={styles.statusPillText}>
              {getStatusPillText(job.status, formatTimer(elapsedSeconds))}
            </Text>
          </View>
          <Text style={styles.orderNumberText}>Order #{job.orderId}</Text>
        </View>

        {/* Customer & Address card */}
        <View style={styles.customerCard}>
          <View style={styles.customerHeaderRow}>
            <View style={styles.customerInfoCol}>
              <Text style={styles.customerName}>{job.customerName}</Text>
              <Text style={styles.serviceName}>
                {getServiceTitle(job.serviceType)}
              </Text>
            </View>
            <View style={styles.payoutBadge}>
              <Text style={styles.payoutValue}>
                ${(job.totalPayoutCents / 100).toFixed(2)}
              </Text>
              <Text style={styles.payoutSub}>Guaranteed</Text>
            </View>
          </View>

          {/* Address row with quick navigation button */}
          <View style={styles.addressRow}>
            <Ionicons
              name="location"
              size={18}
              color="#0058B8"
              style={styles.pinIcon}
            />
            <Text style={styles.addressText} numberOfLines={2}>
              {job.address}
            </Text>
            <Pressable
              style={styles.navButton}
              onPress={handleOpenMaps}
              hitSlop={6}
            >
              <Ionicons name="navigate" size={16} color="#FFFFFF" />
              <Text style={styles.navButtonText}>Nav</Text>
            </Pressable>
          </View>

          {/* Contact & Gate code row */}
          <View style={styles.contactDetailsRow}>
            {job.gateCode ? (
              <View style={styles.gateCodeBadge}>
                <Ionicons name="key" size={13} color="#D97706" />
                <Text style={styles.gateCodeText}>Gate: {job.gateCode}</Text>
              </View>
            ) : null}
            <Pressable
              style={styles.callButton}
              onPress={handleCallCustomer}
              hitSlop={6}
            >
              <Ionicons name="call" size={14} color="#0058B8" />
              <Text style={styles.callButtonText}>Call Customer</Text>
            </Pressable>
          </View>

          {job.specialInstructions ? (
            <View style={styles.instructionsBox}>
              <Ionicons name="alert-circle" size={15} color="#475569" />
              <Text style={styles.instructionsText}>
                {job.specialInstructions}
              </Text>
            </View>
          ) : null}
        </View>

        {/* PHASE 1: ASSIGNED (Ready to start trip) */}
        {job.status === "assigned" && (
          <View style={styles.actionSection}>
            <View style={styles.stepInfoBox}>
              <Text style={styles.stepHeading}>
                Step 1: Start navigation to customer
              </Text>
              <Text style={styles.stepSub}>
                Customer has been notified that your shift is active. Depart now
                to maintain on-time rating.
              </Text>
            </View>
            <Pressable style={styles.primaryActionButton} onPress={startTrip}>
              <Ionicons name="car" size={20} color="#FFFFFF" />
              <Text style={styles.primaryActionText}>START TRIP</Text>
            </Pressable>
          </View>
        )}

        {/* PHASE 2: EN ROUTE (Swipe to confirm arrival!) */}
        {job.status === "en_route" && (
          <View style={styles.actionSection}>
            <View style={styles.stepInfoBox}>
              <Text style={styles.stepHeading}>
                Step 2: Confirm arrival at job site
              </Text>
              <Text style={styles.stepSub}>
                When safely parked at the property, swipe horizontally below to
                confirm your arrival.
              </Text>
            </View>
            <View style={styles.swipeWrapper}>
              <SwipeActionButton
                label="SWIPE TO CONFIRM ARRIVAL"
                onConfirm={confirmArrival}
                variant="primary"
              />
            </View>
          </View>
        )}

        {/* PHASE 3: ARRIVED (Mandatory Before Photos -> Start Service) */}
        {job.status === "arrived" && (
          <ArrivedPhaseView
            job={job}
            onSimulatePhoto={handleSimulateBeforePhoto}
            onRemovePhoto={removeBeforePhoto}
            onStartService={startService}
          />
        )}

        {/* PHASE 4: IN PROGRESS (Checklist + After Photos + Swipe Complete!) */}
        {job.status === "in_progress" && (
          <InProgressPhaseView
            job={job}
            elapsedSeconds={elapsedSeconds}
            completionNotes={completionNotes}
            setCompletionNotes={setCompletionNotes}
            onToggleTask={toggleTask}
            onSimulatePhoto={handleSimulateAfterPhoto}
            onRemovePhoto={removeAfterPhoto}
            onCompleteJob={completeJob}
          />
        )}

        {/* PHASE 5: COMPLETED SUMMARY (Celebration screen!) */}
        {job.status === "completed" && (
          <CompletedSummaryView job={job} onDismiss={dismissCompletedJob} />
        )}
      </ScrollView>
    </View>
  );
};

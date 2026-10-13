import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { TripRecord } from "@/lib/types";

import { DriverHeader } from "./driver-header";
import { MapCanvas } from "./map-canvas";

interface TripDetailModalProps {
  trip: TripRecord | null;
  onClose: () => void;
}

const styles = StyleSheet.create({
  blueCard: {
    backgroundColor: "#0058B8",
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: -20,
    padding: 18,
    shadowColor: "#000000",
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    zIndex: 10,
  },
  blueCardTitle: {
    color: "#E0F2FE",
    fontSize: 15,
    fontWeight: "600",
  },
  blueCardTotal: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "800",
  },
  breakdownLabel: {
    color: "#E0F2FE",
    fontSize: 14,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  breakdownValue: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  cardHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  closeBtn: {
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    borderRadius: 24,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    marginHorizontal: 16,
    marginTop: 20,
  },
  closeBtnText: {
    color: "#0058B8",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  connectingLine: {
    backgroundColor: "#CBD5E1",
    height: 24,
    marginLeft: 15,
    width: 2,
  },
  container: {
    backgroundColor: "#F8FAFC",
    flex: 1,
  },
  content: {
    flex: 1,
  },
  dottedDivider: {
    borderColor: "rgba(255, 255, 255, 0.25)",
    borderStyle: "dashed",
    borderWidth: 0.5,
    marginVertical: 4,
  },
  mapBadge: {
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    borderRadius: 12,
    bottom: 30,
    left: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: "absolute",
  },
  mapBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
  },
  mapHeaderBox: {
    height: 200,
    position: "relative",
    width: "100%",
  },
  orderNumberLabel: {
    color: "#64748B",
    fontSize: 13,
  },
  orderStatusRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  statusPillBadge: {
    borderRadius: 6,
    fontSize: 11,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusPillCanceled: {
    backgroundColor: "#FEE2E2",
    color: "#EF4444",
  },
  statusPillCompleted: {
    backgroundColor: "#ECFDF5",
    color: "#065F46",
  },
  stepAddress: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 2,
  },
  stepIconDotBlue: {
    alignItems: "center",
    backgroundColor: "#0058B8",
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    marginRight: 12,
    width: 32,
  },
  stepIconDotGreen: {
    alignItems: "center",
    backgroundColor: "#10B981",
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    marginRight: 12,
    width: 32,
  },
  stepSub: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 1,
  },
  stepTextCol: {
    flex: 1,
  },
  stepTitle: {
    color: "#0058B8",
    fontSize: 13,
    fontWeight: "700",
  },
  tagPill: {
    backgroundColor: "#F1F5F9",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tagPillText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "500",
  },
  tagsRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
  },
  timelineCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 16,
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
  },
  timelineHeading: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 16,
  },
  timelineStep: {
    flexDirection: "row",
  },
  tipsDisclaimer: {
    color: "rgba(255, 255, 255, 0.75)",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 12,
  },
  titleInfoRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
});

export const TripDetailModal = ({ onClose, trip }: TripDetailModalProps) => {
  const insets = useSafeAreaInsets();

  if (!trip) {
    return null;
  }

  const totalFormatted = (trip.payoutCents / 100).toFixed(2);
  const baseFormatted = (trip.basePayCents / 100).toFixed(2);
  const tipFormatted = (trip.tipCents / 100).toFixed(2);

  return (
    <Modal
      visible={!!trip}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <DriverHeader
          title={`Trip ${trip.orderNumber}`}
          onBack={onClose}
          hasNotificationBadge
        />

        <ScrollView
          style={styles.content}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        >
          {/* Map Preview at top (matching Screenshot 5) */}
          <View style={styles.mapHeaderBox}>
            <MapCanvas
              hasRoute
              routeStops={[
                { label: "★", x: 200, y: 100 },
                { label: "1", x: 260, y: 70 },
              ]}
              showHotspots={false}
            />
            <View style={styles.mapBadge}>
              <Text style={styles.mapBadgeText}>Completed Route</Text>
            </View>
          </View>

          {/* Blue Payout Card (matching Screenshot 5) */}
          <View style={styles.blueCard}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.titleInfoRow}>
                <Text style={styles.blueCardTitle}>Confirmed Total</Text>
                <Ionicons
                  name="information-circle-outline"
                  size={16}
                  color="#93C5FD"
                />
              </View>
              <Text style={styles.blueCardTotal}>${totalFormatted}</Text>
            </View>

            <View style={styles.dottedDivider} />

            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Base Pay</Text>
              <Text style={styles.breakdownValue}>${baseFormatted}</Text>
            </View>

            <View style={styles.dottedDivider} />

            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Tips</Text>
              <Text style={styles.breakdownValue}>${tipFormatted}</Text>
            </View>

            <Text style={styles.tipsDisclaimer}>
              Customers can adjust tips up to 24 hours after completion. All
              payouts deposit directly to your linked Stripe account.
            </Text>
          </View>

          {/* Timeline Section */}
          <View style={styles.timelineCard}>
            <Text style={styles.timelineHeading}>
              Service Details & Timeline
            </Text>

            {/* Hub Pickup step */}
            <View style={styles.timelineStep}>
              <View style={styles.stepIconDotBlue}>
                <Ionicons name="sparkles" size={14} color="#FFFFFF" />
              </View>
              <View style={styles.stepTextCol}>
                <Text style={styles.stepTitle}>
                  Dispatch assigned · {trip.timeLabel}
                </Text>
                <Text style={styles.stepAddress}>
                  CastleCare Regional Hub #157
                </Text>
                <Text style={styles.stepSub}>3509 E Race Ave, Searcy AR</Text>
              </View>
            </View>

            {/* Connecting line */}
            <View style={styles.connectingLine} />

            {/* Service Execution step */}
            <View style={styles.timelineStep}>
              <View style={styles.stepIconDotGreen}>
                <Ionicons name="checkmark" size={14} color="#FFFFFF" />
              </View>
              <View style={styles.stepTextCol}>
                <Text style={styles.stepTitle}>
                  Completed: {trip.serviceTitle}
                </Text>
                <Text style={styles.stepAddress}>{trip.address}</Text>
                <View style={styles.tagsRow}>
                  <View style={styles.tagPill}>
                    <Text style={styles.tagPillText}>{trip.itemsSummary}</Text>
                  </View>
                  <View style={styles.tagPill}>
                    <Text style={styles.tagPillText}>{trip.durationLabel}</Text>
                  </View>
                </View>
                <View style={styles.orderStatusRow}>
                  <Text style={styles.orderNumberLabel}>
                    Order {trip.orderNumber}
                  </Text>
                  <Text
                    style={[
                      styles.statusPillBadge,
                      trip.status === "completed"
                        ? styles.statusPillCompleted
                        : styles.statusPillCanceled,
                    ]}
                  >
                    {trip.status.toUpperCase()}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Close button */}
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>CLOSE DETAILS</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
};

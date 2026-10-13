import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DriverHeader } from "@/components/driver-header";
import { TripDetailModal } from "@/components/trip-detail-modal";
import { SAMPLE_TRIPS_HISTORY } from "@/lib/mock-data";
import type { TripRecord } from "@/lib/types";

const styles = StyleSheet.create({
  cardChevron: {
    marginLeft: 6,
  },
  cardMainRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  container: {
    backgroundColor: "#F8FAFC",
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  dateHeading: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
    marginBottom: 8,
    marginTop: 18,
    textTransform: "uppercase",
  },
  iconCircle: {
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    marginRight: 12,
    width: 40,
  },
  payoutCol: {
    alignItems: "flex-end",
  },
  payoutText: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "800",
  },
  statBox: {
    alignItems: "center",
    flex: 1,
  },
  statDivider: {
    backgroundColor: "#E2E8F0",
    height: 28,
    width: 1,
  },
  statLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "500",
    marginTop: 2,
  },
  statValue: {
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "800",
  },
  statsCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 14,
    paddingVertical: 14,
  },
  statusBadge: {
    borderRadius: 6,
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusBadgeCanceled: {
    backgroundColor: "#FEE2E2",
  },
  statusBadgeCompleted: {
    backgroundColor: "#ECFDF5",
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
  },
  statusTextCanceled: {
    color: "#EF4444",
  },
  statusTextCompleted: {
    color: "#065F46",
  },
  tripAddress: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 2,
  },
  tripCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    padding: 14,
  },
  tripCardPressed: {
    backgroundColor: "#F1F5F9",
  },
  tripInfoCol: {
    flex: 1,
  },
  tripTime: {
    color: "#0058B8",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  tripTitle: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "700",
  },
});

const getServiceIcon = (type: string): keyof typeof Ionicons.glyphMap => {
  if (type === "lawncare") {
    return "leaf";
  }
  if (type === "window_washing") {
    return "water";
  }
  return "shirt";
};

const groupTripsByDate = (
  history: TripRecord[]
): Record<string, TripRecord[]> => {
  const grouped: Record<string, TripRecord[]> = {};
  for (const trip of history) {
    grouped[trip.dateLabel] ??= [];
    grouped[trip.dateLabel]?.push(trip);
  }
  return grouped;
};

export default function TripsScreen() {
  const insets = useSafeAreaInsets();
  const [selectedTrip, setSelectedTrip] = useState<TripRecord | null>(null);

  const groupedTrips = groupTripsByDate(SAMPLE_TRIPS_HISTORY);

  return (
    <View style={styles.container}>
      <DriverHeader title="Trips" subtitle="CastleCare Completed Dispatches" />

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Summary stats */}
        <View style={styles.statsCard}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>18</Text>
            <Text style={styles.statLabel}>Total Trips</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statValue}>97%</Text>
            <Text style={styles.statLabel}>On-Time Arrival</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statValue}>$42.50</Text>
            <Text style={styles.statLabel}>Avg. Payout</Text>
          </View>
        </View>

        {/* Date groups */}
        {Object.entries(groupedTrips).map(([dateLabel, trips]) => (
          <View key={dateLabel}>
            <Text style={styles.dateHeading}>{dateLabel}</Text>
            {trips.map((trip) => {
              const isCompleted = trip.status === "completed";
              const formattedPayout = (trip.payoutCents / 100).toFixed(2);
              const serviceIcon = getServiceIcon(trip.serviceType);

              return (
                <Pressable
                  key={trip.id}
                  style={({ pressed }) => [
                    styles.tripCard,
                    pressed && styles.tripCardPressed,
                  ]}
                  onPress={() => setSelectedTrip(trip)}
                >
                  <View style={styles.cardMainRow}>
                    <View style={styles.iconCircle}>
                      <Ionicons name={serviceIcon} size={18} color="#0058B8" />
                    </View>

                    <View style={styles.tripInfoCol}>
                      <Text style={styles.tripTitle}>{trip.serviceTitle}</Text>
                      <Text style={styles.tripAddress} numberOfLines={1}>
                        {trip.address}
                      </Text>
                      <Text style={styles.tripTime}>{trip.timeLabel}</Text>
                    </View>

                    <View style={styles.payoutCol}>
                      <Text style={styles.payoutText}>${formattedPayout}</Text>
                      <View
                        style={[
                          styles.statusBadge,
                          isCompleted
                            ? styles.statusBadgeCompleted
                            : styles.statusBadgeCanceled,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusText,
                            isCompleted
                              ? styles.statusTextCompleted
                              : styles.statusTextCanceled,
                          ]}
                        >
                          {trip.status.toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color="#94A3B8"
                      style={styles.cardChevron}
                    />
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {/* Trip Detail modal */}
      <TripDetailModal
        trip={selectedTrip}
        onClose={() => setSelectedTrip(null)}
      />
    </View>
  );
}

import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DriverHeader } from "@/components/driver-header";
import { TierProgressBar } from "@/components/tier-progress-bar";
import { SAMPLE_DRIVER_METRICS, SAMPLE_INCENTIVES } from "@/lib/mock-data";
import type { IncentiveBonus } from "@/lib/types";

const FILTER_TABS = ["Active", "Upcoming", "Completed"] as const;
type FilterTab = (typeof FILTER_TABS)[number];

const styles = StyleSheet.create({
  bannerBody: {
    color: "#E0F2FE",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  bannerTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  container: {
    backgroundColor: "#F8FAFC",
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  filterChip: {
    backgroundColor: "#F1F5F9",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: "#0058B8",
  },
  filterChipText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "600",
  },
  filterChipTextActive: {
    color: "#FFFFFF",
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 20,
  },
  incentiveCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 10,
    padding: 16,
  },
  incentiveDesc: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  incentiveHeaderRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  incentiveInfoCol: {
    flex: 1,
    marginRight: 8,
  },
  incentiveRewardBadge: {
    alignItems: "center",
    backgroundColor: "#ECFDF5",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  incentiveRewardText: {
    color: "#065F46",
    fontSize: 15,
    fontWeight: "800",
  },
  incentiveTitle: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "700",
  },
  progressCountsRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  progressStepText: {
    color: "#0F172A",
    fontSize: 12,
    fontWeight: "600",
  },
  progressTimeLeftText: {
    color: "#64748B",
    fontSize: 11,
  },
  progressTrack: {
    backgroundColor: "#EFF6FF",
    borderRadius: 3,
    height: 6,
    marginTop: 6,
    overflow: "hidden",
    width: "100%",
  },
  progressTrackFill: {
    backgroundColor: "#0058B8",
    borderRadius: 3,
    height: "100%",
  },
  sectionTitle: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "700",
    marginTop: 20,
  },
  shineBanner: {
    backgroundColor: "#0058B8",
    borderRadius: 16,
    elevation: 3,
    marginTop: 14,
    padding: 18,
    shadowColor: "#000000",
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
  },
});

export default function IncentivesScreen() {
  const insets = useSafeAreaInsets();
  const [activeFilter, setActiveFilter] = useState<FilterTab>("Active");

  const filteredIncentives = SAMPLE_INCENTIVES.filter(
    (item: IncentiveBonus) => {
      if (activeFilter === "Active") {
        return item.progressCount < item.targetCount;
      }
      if (activeFilter === "Completed") {
        return item.progressCount >= item.targetCount;
      }
      return true;
    }
  );

  return (
    <View style={styles.container}>
      <DriverHeader
        title="Incentives & Metrics"
        subtitle="CastleCare Driver Rewards"
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Shine Banner */}
        <View style={styles.shineBanner}>
          <Text style={styles.bannerTitle}>Rewards that shine ✨</Text>
          <Text style={styles.bannerBody}>
            Earn guaranteed bonus rewards on top of base pay & customer tips by
            hitting multi-service milestones and maintaining 5-star customer
            ratings.
          </Text>
        </View>

        {/* Tier Progress Bar & Performance Metrics */}
        <View style={{ marginTop: 14 }}>
          <TierProgressBar metrics={SAMPLE_DRIVER_METRICS} />
        </View>

        {/* Incentive Filter Tabs */}
        <View style={styles.filterRow}>
          {FILTER_TABS.map((tab) => (
            <Pressable
              key={tab}
              style={[
                styles.filterChip,
                activeFilter === tab && styles.filterChipActive,
              ]}
              onPress={() => setActiveFilter(tab)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  activeFilter === tab && styles.filterChipTextActive,
                ]}
              >
                {tab}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Incentives List */}
        <Text style={styles.sectionTitle}>
          {activeFilter} Programs ({filteredIncentives.length})
        </Text>

        {filteredIncentives.map((item) => {
          const progressPercent = Math.min(
            100,
            (item.progressCount / item.targetCount) * 100
          );
          const rewardFormatted = (item.amountCents / 100).toFixed(0);

          return (
            <View key={item.id} style={styles.incentiveCard}>
              <View style={styles.incentiveHeaderRow}>
                <View style={styles.incentiveInfoCol}>
                  <Text style={styles.incentiveTitle}>{item.title}</Text>
                  <Text style={styles.incentiveDesc}>{item.subtitle}</Text>
                </View>
                <View style={styles.incentiveRewardBadge}>
                  <Text style={styles.incentiveRewardText}>
                    +${rewardFormatted}
                  </Text>
                </View>
              </View>

              <View style={styles.progressCountsRow}>
                <Text style={styles.progressStepText}>
                  {item.progressCount} of {item.targetCount} completed
                </Text>
                <Text style={styles.progressTimeLeftText}>
                  {item.eligibleTimeRange}
                </Text>
              </View>

              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressTrackFill,
                    {
                      backgroundColor:
                        progressPercent >= 100 ? "#10B981" : "#0058B8",
                      width: `${progressPercent}%`,
                    },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

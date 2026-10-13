import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { DriverMetrics } from "@/lib/types";

interface TierProgressBarProps {
  metrics: DriverMetrics;
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  markerDot: {
    alignItems: "center",
    backgroundColor: "#94A3B8",
    borderRadius: 9,
    height: 18,
    justifyContent: "center",
    marginBottom: 4,
    width: 18,
  },
  markerDotActive: {
    backgroundColor: "#0058B8",
  },
  markerItem: {
    alignItems: "center",
  },
  markerText: {
    color: "#1E293B",
    fontSize: 11,
    fontWeight: "700",
  },
  markerTierName: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "500",
  },
  markersRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingHorizontal: 8,
  },
  metricCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    padding: 16,
  },
  metricFill: {
    backgroundColor: "#0058B8",
    borderRadius: 3,
    height: "100%",
  },
  metricFooter: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
  },
  metricFooterText: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "500",
  },
  metricHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  metricRequirement: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "500",
  },
  metricTitle: {
    color: "#1E293B",
    fontSize: 14,
    fontWeight: "600",
  },
  metricTrack: {
    backgroundColor: "#EFF6FF",
    borderRadius: 3,
    height: 6,
    marginTop: 8,
    overflow: "hidden",
    width: "100%",
  },
  metricValue: {
    color: "#0F172A",
    fontSize: 26,
    fontWeight: "800",
    marginTop: 4,
  },
  metricsSection: {
    marginTop: 20,
  },
  pointsCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#BFDBFE",
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
  },
  pointsHeaderRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  pointsLabel: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "500",
  },
  pointsValue: {
    color: "#0F172A",
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  ratingValueRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  sectionTitle: {
    color: "#1E293B",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
  },
  tierBadge: {
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderRadius: 20,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tierBadgeText: {
    color: "#0058B8",
    fontSize: 12,
    fontWeight: "700",
  },
  trackBackground: {
    backgroundColor: "#E2E8F0",
    borderRadius: 4,
    height: 6,
    width: "100%",
  },
  trackContainer: {
    marginTop: 16,
  },
  trackFill: {
    backgroundColor: "#0058B8",
    borderRadius: 4,
    height: "100%",
  },
});

export const TierProgressBar = ({ metrics }: TierProgressBarProps) => {
  const maxPoints = metrics.sapphireThreshold;
  const progressPercent = Math.min(
    100,
    Math.max(5, (metrics.pointsThisMonth / maxPoints) * 100)
  );

  return (
    <View style={styles.container}>
      {/* Top Points summary card */}
      <View style={styles.pointsCard}>
        <View style={styles.pointsHeaderRow}>
          <View>
            <Text style={styles.pointsLabel}>Points this month</Text>
            <Text style={styles.pointsValue}>{metrics.pointsThisMonth}</Text>
          </View>
          <View style={styles.tierBadge}>
            <Ionicons name="ribbon" size={16} color="#0058B8" />
            <Text style={styles.tierBadgeText}>
              Qualified for {metrics.currentTier}
            </Text>
          </View>
        </View>

        {/* Multi-step progress track */}
        <View style={styles.trackContainer}>
          <View style={styles.trackBackground}>
            <View
              style={[styles.trackFill, { width: `${progressPercent}%` }]}
            />
          </View>

          {/* Markers */}
          <View style={styles.markersRow}>
            <View style={styles.markerItem}>
              <View
                style={[
                  styles.markerDot,
                  metrics.pointsThisMonth >= metrics.silverThreshold &&
                    styles.markerDotActive,
                ]}
              >
                <Ionicons name="sparkles" size={10} color="#FFFFFF" />
              </View>
              <Text style={styles.markerText}>{metrics.silverThreshold}</Text>
              <Text style={styles.markerTierName}>Silver</Text>
            </View>

            <View style={styles.markerItem}>
              <View
                style={[
                  styles.markerDot,
                  metrics.pointsThisMonth >= metrics.goldThreshold &&
                    styles.markerDotActive,
                ]}
              >
                <Ionicons name="star" size={10} color="#FFFFFF" />
              </View>
              <Text style={styles.markerText}>{metrics.goldThreshold}</Text>
              <Text style={styles.markerTierName}>Gold</Text>
            </View>

            <View style={styles.markerItem}>
              <View
                style={[
                  styles.markerDot,
                  metrics.pointsThisMonth >= metrics.sapphireThreshold &&
                    styles.markerDotActive,
                ]}
              >
                <Ionicons name="diamond" size={10} color="#FFFFFF" />
              </View>
              <Text style={styles.markerText}>{metrics.sapphireThreshold}</Text>
              <Text style={styles.markerTierName}>Sapphire</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Metrics breakdown */}
      <View style={styles.metricsSection}>
        <Text style={styles.sectionTitle}>My Performance Metrics</Text>

        {/* On-Time Arrival */}
        <View style={styles.metricCard}>
          <View style={styles.metricHeaderRow}>
            <Text style={styles.metricTitle}>On-time arrival at job site</Text>
            <Text style={styles.metricRequirement}>93% for Silver</Text>
          </View>
          <Text style={styles.metricValue}>
            {metrics.onTimeArrivalPercent}%
          </Text>
          <View style={styles.metricTrack}>
            <View
              style={[
                styles.metricFill,
                { width: `${metrics.onTimeArrivalPercent}%` },
              ]}
            />
          </View>
          <View style={styles.metricFooter}>
            <Ionicons name="checkmark-done" size={14} color="#10B981" />
            <Text style={styles.metricFooterText}>
              Exceeding minimum qualification standard
            </Text>
          </View>
        </View>

        {/* Completion Rate */}
        <View style={styles.metricCard}>
          <View style={styles.metricHeaderRow}>
            <Text style={styles.metricTitle}>Job completion rate</Text>
            <Text style={styles.metricRequirement}>93% for Silver</Text>
          </View>
          <Text style={styles.metricValue}>
            {metrics.completionRatePercent}%
          </Text>
          <View style={styles.metricTrack}>
            <View
              style={[
                styles.metricFill,
                { width: `${metrics.completionRatePercent}%` },
              ]}
            />
          </View>
          <View style={styles.metricFooter}>
            <Ionicons name="checkmark-done" size={14} color="#10B981" />
            <Text style={styles.metricFooterText}>
              142 total jobs completed successfully
            </Text>
          </View>
        </View>

        {/* Customer Rating */}
        <View style={styles.metricCard}>
          <View style={styles.metricHeaderRow}>
            <Text style={styles.metricTitle}>Customer satisfaction rating</Text>
            <Text style={styles.metricRequirement}>4.8 for Gold</Text>
          </View>
          <View style={styles.ratingValueRow}>
            <Text style={styles.metricValue}>{metrics.customerRating}</Text>
            <Ionicons name="star" size={18} color="#F59E0B" />
          </View>
          <View style={styles.metricTrack}>
            <View
              style={[
                styles.metricFill,
                { width: `${(metrics.customerRating / 5) * 100}%` },
              ]}
            />
          </View>
          <View style={styles.metricFooter}>
            <Ionicons name="sparkles" size={14} color="#F59E0B" />
            <Text style={styles.metricFooterText}>
              Top 5% rated CastleCare service provider
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

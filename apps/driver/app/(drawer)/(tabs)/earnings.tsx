import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DriverHeader } from "@/components/driver-header";
import { EarningsBarChart } from "@/components/earnings-bar-chart";
import { SAMPLE_CURRENT_WEEK } from "@/lib/mock-data";

const PAST_WEEKS = [
  { dateRange: "Oct 6 – Oct 12", totalCents: 48_250, tripsCount: 14 },
  { dateRange: "Sep 29 – Oct 5", totalCents: 51_000, tripsCount: 15 },
  { dateRange: "Sep 22 – Sep 28", totalCents: 39_500, tripsCount: 11 },
  { dateRange: "Sep 15 – Sep 21", totalCents: 42_000, tripsCount: 12 },
];

const styles = StyleSheet.create({
  bankDepositSub: {
    color: "#E0F2FE",
    fontSize: 11,
    marginTop: 1,
  },
  bankDepositText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  bannerBreakdownRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 4,
  },
  bannerDivider: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    height: 1,
    marginVertical: 12,
  },
  bannerLabel: {
    color: "#BAE6FD",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  bannerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  bannerSubtext: {
    color: "#E0F2FE",
    fontSize: 13,
  },
  bannerTotal: {
    color: "#FFFFFF",
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  cashOutBtn: {
    alignItems: "center",
    backgroundColor: "#0058B8",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cashOutBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  cashOutCard: {
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    padding: 14,
  },
  cashOutSub: {
    color: "#1E3A8A",
    fontSize: 11,
    marginTop: 1,
  },
  cashOutTitle: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "700",
  },
  chartCard: {
    backgroundColor: "#0058B8",
    borderRadius: 16,
    marginTop: 14,
    padding: 14,
  },
  chartHeadingRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 6,
  },
  chartSubtitle: {
    color: "#BAE6FD",
    fontSize: 12,
  },
  chartTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  container: {
    backgroundColor: "#F8FAFC",
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  depositInfoRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  pastWeekAmount: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "700",
  },
  pastWeekCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    padding: 14,
  },
  pastWeekDate: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "600",
  },
  pastWeekTrips: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 2,
  },
  pastWeeksHeading: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 10,
    marginTop: 20,
  },
  selectedDayCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 12,
    padding: 14,
  },
  selectedDayHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  selectedDayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  selectedDaySub: {
    color: "#64748B",
    fontSize: 12,
  },
  selectedDayTitle: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "700",
  },
  selectedDayValue: {
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "600",
  },
  taxCard: {
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
    padding: 14,
  },
  taxText: {
    color: "#475569",
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
  },
  topWeeklyCard: {
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

const handleInstantCashOut = () => {
  Alert.alert(
    "Instant Cash Out",
    "Transfer $118.50 immediately to your linked debit card for a $0.50 fee?",
    [
      { style: "cancel", text: "Cancel" },
      {
        onPress: () => {
          Alert.alert(
            "Success",
            "Payout of $118.00 initiated via Stripe Connect Instant Payout."
          );
        },
        text: "Confirm Transfer",
      },
    ]
  );
};

export default function EarningsScreen() {
  const insets = useSafeAreaInsets();
  // Default to Tuesday (today)
  const [selectedDayIndex, setSelectedDayIndex] = useState(1);

  const selectedDay = SAMPLE_CURRENT_WEEK.days[selectedDayIndex];

  const totalFormatted = (SAMPLE_CURRENT_WEEK.totalCents / 100).toFixed(2);
  const baseFormatted = (32_000 / 100).toFixed(2);
  const tipsFormatted = (4500 / 100).toFixed(2);

  return (
    <View style={styles.container}>
      <DriverHeader title="Earnings" subtitle="Stripe Direct Payouts" />

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Royal Blue Weekly Summary */}
        <View style={styles.topWeeklyCard}>
          <View style={styles.bannerRow}>
            <View>
              <Text style={styles.bannerLabel}>Confirmed This Week</Text>
              <Text style={styles.bannerTotal}>${totalFormatted}</Text>
              <View style={styles.bannerBreakdownRow}>
                <Text style={styles.bannerSubtext}>Base: ${baseFormatted}</Text>
                <Text style={styles.bannerSubtext}>Tips: ${tipsFormatted}</Text>
              </View>
            </View>
            <Ionicons name="shield-checkmark" size={28} color="#93C5FD" />
          </View>

          <View style={styles.bannerDivider} />

          <View style={styles.depositInfoRow}>
            <Ionicons name="business" size={16} color="#BAE6FD" />
            <View>
              <Text style={styles.bankDepositText}>
                Direct Deposit: Bank of America ••4291
              </Text>
              <Text style={styles.bankDepositSub}>
                Deposits automatically every Monday at 4:00 AM
              </Text>
            </View>
          </View>
        </View>

        {/* Instant Cash Out banner */}
        <View style={styles.cashOutCard}>
          <View>
            <Text style={styles.cashOutTitle}>Instant Cash Out</Text>
            <Text style={styles.cashOutSub}>$118.50 available right now</Text>
          </View>
          <Pressable style={styles.cashOutBtn} onPress={handleInstantCashOut}>
            <Text style={styles.cashOutBtnText}>Cash Out</Text>
          </Pressable>
        </View>

        {/* Weekly Bar Chart */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeadingRow}>
            <Text style={styles.chartTitle}>
              {SAMPLE_CURRENT_WEEK.dateRangeLabel}
            </Text>
            <Text style={styles.chartSubtitle}>Tap day to view breakdown</Text>
          </View>
          <EarningsBarChart
            days={SAMPLE_CURRENT_WEEK.days}
            selectedDayIndex={selectedDayIndex}
            onSelectDay={setSelectedDayIndex}
          />
        </View>

        {/* Selected Day Details card */}
        {selectedDay && (
          <View style={styles.selectedDayCard}>
            <View style={styles.selectedDayHeader}>
              <Text style={styles.selectedDayTitle}>
                {selectedDay.dayName}, Oct {selectedDay.dayNumber}
              </Text>
              <Text style={styles.selectedDaySub}>
                {selectedDay.tripsCount} Completed Jobs
              </Text>
            </View>
            <View style={styles.selectedDayRow}>
              <Text style={styles.selectedDaySub}>Trip Earnings</Text>
              <Text style={styles.selectedDayValue}>
                ${(selectedDay.amountCents / 100).toFixed(2)}
              </Text>
            </View>
            <View style={styles.selectedDayRow}>
              <Text style={styles.selectedDaySub}>Customer Tips</Text>
              <Text style={styles.selectedDayValue}>
                ${(selectedDay.tipsCents / 100).toFixed(2)}
              </Text>
            </View>
          </View>
        )}

        {/* Past Weeks list */}
        <Text style={styles.pastWeeksHeading}>Past Weekly Statements</Text>
        {PAST_WEEKS.map((week) => (
          <View key={week.dateRange} style={styles.pastWeekCard}>
            <View>
              <Text style={styles.pastWeekDate}>{week.dateRange}</Text>
              <Text style={styles.pastWeekTrips}>{week.tripsCount} trips</Text>
            </View>
            <Text style={styles.pastWeekAmount}>
              ${(week.totalCents / 100).toFixed(2)}
            </Text>
          </View>
        ))}

        {/* Tax documents note */}
        <View style={styles.taxCard}>
          <Ionicons name="document-text-outline" size={20} color="#64748B" />
          <Text style={styles.taxText}>
            View 1099-NEC tax forms & monthly earnings statements in Account
            tab.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

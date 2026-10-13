import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface BusyTimesChartProps {
  onExploreWeek?: () => void;
}

const HOURLY_BARS = [
  { active: false, height: 26, label: "6a" },
  { active: false, height: 34, label: "" },
  { active: false, height: 28, label: "" },
  { active: false, height: 38, label: "9a" },
  { active: false, height: 32, label: "" },
  { active: false, height: 44, label: "" },
  { active: true, height: 58, label: "12p" },
  { active: true, height: 54, label: "" },
  { active: true, height: 48, label: "3p" },
  { active: true, height: 50, label: "" },
  { active: true, height: 45, label: "6p" },
  { active: true, height: 36, label: "" },
  { active: true, height: 26, label: "9p" },
  { active: true, height: 32, label: "" },
];

const SEVEN_DAY_PREVIEW = [
  { active: true, dayName: "S", dayNum: "11", height: 55 },
  { active: false, dayName: "M", dayNum: "12", height: 38 },
  { active: false, dayName: "T", dayNum: "13", height: 42 },
  { active: false, dayName: "W", dayNum: "14", height: 46 },
  { active: false, dayName: "T", dayNum: "15", height: 40 },
  { active: false, dayName: "F", dayNum: "16", height: 48 },
  { active: false, dayName: "S", dayNum: "17", height: 54 },
];

const styles = StyleSheet.create({
  activeCurrentHourBar: {
    backgroundColor: "#0058B8",
  },
  barItem: {
    alignItems: "center",
    flex: 1,
    height: 80,
    justifyContent: "flex-end",
  },
  barPillar: {
    borderRadius: 6,
    width: 14,
  },
  barPillarWrapper: {
    alignItems: "center",
    height: 60,
    justifyContent: "flex-end",
  },
  barsRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    height: 80,
    justifyContent: "space-between",
  },
  blueBarIndicator: {
    backgroundColor: "#0058B8",
    borderRadius: 2,
    height: 28,
    marginRight: 8,
    width: 3.5,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 16,
    borderWidth: 1,
    elevation: 2,
    marginTop: 12,
    padding: 16,
    shadowColor: "#000000",
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  chartContainer: {
    marginTop: 12,
  },
  dayColumn: {
    alignItems: "center",
    flex: 1,
  },
  dayName: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "500",
  },
  dayNameSelected: {
    color: "#FFFFFF",
  },
  dayNum: {
    color: "#1E293B",
    fontSize: 12,
    fontWeight: "700",
  },
  dayNumSelected: {
    color: "#FFFFFF",
  },
  dayPill: {
    alignItems: "center",
    borderRadius: 16,
    marginTop: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  dayPillSelected: {
    backgroundColor: "#0058B8",
  },
  daysRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  forecastHeader: {
    color: "#1E293B",
    fontSize: 13,
    fontWeight: "600",
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  hourLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "500",
    marginTop: 6,
  },
  hourLabelEmpty: {
    height: 14,
    marginTop: 6,
  },
  incentiveCount: {
    color: "#1E293B",
    fontSize: 15,
    fontWeight: "700",
  },
  incentiveLabel: {
    color: "#1E293B",
    fontSize: 13,
    fontWeight: "600",
  },
  incentiveLabelRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  incentiveTextWrapper: {
    justifyContent: "center",
  },
  incentivesFooter: {
    alignItems: "center",
    borderTopColor: "#F1F5F9",
    borderTopWidth: 1,
    flexDirection: "row",
    marginTop: 12,
    paddingTop: 12,
  },
  mainTitle: {
    color: "#1E293B",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  miniBar: {
    borderRadius: 4,
    width: 12,
  },
  miniBarSlot: {
    alignItems: "center",
    height: 60,
    justifyContent: "flex-end",
  },
  sevenDayContainer: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    marginTop: 12,
    padding: 12,
  },
  subtitle: {
    color: "#64748B",
    fontSize: 13,
    marginTop: 2,
  },
  titleColumn: {
    flex: 1,
  },
});

export const BusyTimesChart = ({ onExploreWeek }: BusyTimesChartProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <View style={styles.card}>
      <Pressable
        style={styles.headerRow}
        onPress={() => {
          setIsExpanded(!isExpanded);
          onExploreWeek?.();
        }}
      >
        <View style={styles.titleColumn}>
          <Text style={styles.mainTitle}>Popular offer times: today</Text>
          <Text style={styles.subtitle}>
            Explore additional days to drive this week
          </Text>
        </View>
        <Ionicons
          name={isExpanded ? "chevron-up" : "chevron-forward"}
          size={18}
          color="#64748B"
        />
      </Pressable>

      {/* 7-Day Mini Bar Forecast if expanded */}
      {isExpanded && (
        <View style={styles.sevenDayContainer}>
          <Text style={styles.forecastHeader}>7-Day Forecast</Text>
          <View style={styles.daysRow}>
            {SEVEN_DAY_PREVIEW.map((item) => (
              <View
                key={`day-${item.dayName}-${item.dayNum}`}
                style={styles.dayColumn}
              >
                <View style={styles.miniBarSlot}>
                  <View
                    style={[
                      styles.miniBar,
                      {
                        backgroundColor: item.active ? "#0058B8" : "#93C5FD",
                        height: item.height,
                      },
                    ]}
                  />
                </View>
                <View
                  style={[
                    styles.dayPill,
                    item.active && styles.dayPillSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayNum,
                      item.active && styles.dayNumSelected,
                    ]}
                  >
                    {item.dayNum}
                  </Text>
                  <Text
                    style={[
                      styles.dayName,
                      item.active && styles.dayNameSelected,
                    ]}
                  >
                    {item.dayName}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Hourly Bar Chart */}
      <View style={styles.chartContainer}>
        <View style={styles.barsRow}>
          {HOURLY_BARS.map((bar, index) => (
            <View
              key={`bar-${bar.label || "empty"}-${index}`}
              style={styles.barItem}
            >
              <View style={styles.barPillarWrapper}>
                <View
                  style={[
                    styles.barPillar,
                    {
                      backgroundColor: bar.active ? "#60A5FA" : "#E2E8F0",
                      height: bar.height,
                    },
                    bar.active && index === 6 && styles.activeCurrentHourBar,
                  ]}
                />
              </View>
              {bar.label ? (
                <Text style={styles.hourLabel}>{bar.label}</Text>
              ) : (
                <Text style={styles.hourLabelEmpty} />
              )}
            </View>
          ))}
        </View>
      </View>

      {/* Incentives indicator */}
      <View style={styles.incentivesFooter}>
        <View style={styles.blueBarIndicator} />
        <View style={styles.incentiveTextWrapper}>
          <View style={styles.incentiveLabelRow}>
            <Text style={styles.incentiveLabel}>Incentives</Text>
            <Ionicons
              name="information-circle-outline"
              size={14}
              color="#64748B"
            />
          </View>
          <Text style={styles.incentiveCount}>2</Text>
        </View>
      </View>
    </View>
  );
};

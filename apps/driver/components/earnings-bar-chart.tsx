import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { DailyEarnings } from "@/lib/types";

interface EarningsBarChartProps {
  days: DailyEarnings[];
  selectedDayIndex?: number;
  onSelectDay?: (index: number) => void;
}

const styles = StyleSheet.create({
  amountSlot: {
    alignItems: "center",
    height: 18,
    justifyContent: "flex-end",
    marginBottom: 4,
  },
  amountText: {
    color: "#E0F2FE",
    fontSize: 11,
    fontWeight: "600",
  },
  amountTextSelected: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  barFill: {
    borderRadius: 6,
    width: 28,
  },
  barTrack: {
    alignItems: "center",
    height: 95,
    justifyContent: "flex-end",
    width: "100%",
  },
  chartRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    height: 155,
    justifyContent: "space-between",
  },
  container: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    width: "100%",
  },
  dayCol: {
    alignItems: "center",
    flex: 1,
    justifyContent: "flex-end",
  },
  dayLabelContainer: {
    alignItems: "center",
    borderRadius: 8,
    marginTop: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  dayLabelContainerSelected: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
  dayNameText: {
    color: "rgba(255, 255, 255, 0.75)",
    fontSize: 11,
    fontWeight: "500",
  },
  dayNumText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  dayTextSelected: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
});

const getBarBackgroundColor = (
  isSelected: boolean,
  amountCents: number
): string => {
  if (isSelected) {
    return "#FFFFFF";
  }
  if (amountCents > 0) {
    return "#38BDF8";
  }
  return "rgba(255, 255, 255, 0.2)";
};

export const EarningsBarChart = ({
  days,
  onSelectDay,
  selectedDayIndex,
}: EarningsBarChartProps) => {
  const maxAmount = Math.max(...days.map((d) => d.amountCents), 12_000);

  return (
    <View style={styles.container}>
      <View style={styles.chartRow}>
        {days.map((day, index) => {
          const isSelected = selectedDayIndex === index;
          const heightPercent =
            day.amountCents > 0
              ? Math.max(16, (day.amountCents / maxAmount) * 90)
              : 4;

          const amountFormatted =
            day.amountCents > 0
              ? `$${(day.amountCents / 100).toFixed(0)}`
              : "—";

          return (
            <Pressable
              key={`earn-day-${day.dateKey}`}
              style={styles.dayCol}
              onPress={() => onSelectDay?.(index)}
            >
              {/* Dollar value text above bar */}
              <View style={styles.amountSlot}>
                <Text
                  style={[
                    styles.amountText,
                    isSelected && styles.amountTextSelected,
                  ]}
                  numberOfLines={1}
                >
                  {amountFormatted}
                </Text>
              </View>

              {/* Bar track and fill */}
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      backgroundColor: getBarBackgroundColor(
                        isSelected,
                        day.amountCents
                      ),
                      height: heightPercent,
                    },
                  ]}
                />
              </View>

              {/* Day name & date number below */}
              <View
                style={[
                  styles.dayLabelContainer,
                  isSelected && styles.dayLabelContainerSelected,
                ]}
              >
                <Text
                  style={[
                    styles.dayNameText,
                    isSelected && styles.dayTextSelected,
                  ]}
                >
                  {day.dayName}
                </Text>
                <Text
                  style={[
                    styles.dayNumText,
                    isSelected && styles.dayTextSelected,
                  ]}
                >
                  {day.dayNumber}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

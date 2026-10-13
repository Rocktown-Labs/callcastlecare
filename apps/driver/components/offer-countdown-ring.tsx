import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

interface OfferCountdownRingProps {
  secondsLeft: number;
  totalSeconds?: number;
  size?: number;
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  textContainer: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  timerText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
});

const getRingColor = (seconds: number): string => {
  if (seconds <= 15) {
    return "#EF4444";
  }
  if (seconds <= 30) {
    return "#F59E0B";
  }
  return "#0058B8";
};

export const OfferCountdownRing = ({
  secondsLeft,
  size = 46,
  totalSeconds = 60,
}: OfferCountdownRingProps) => {
  const strokeWidth = 3.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const progress = Math.max(0, Math.min(1, secondsLeft / totalSeconds));
  const strokeDashoffset = circumference * (1 - progress);

  const ringColor = getRingColor(secondsLeft);
  const formattedTime = `0:${secondsLeft < 10 ? `0${secondsLeft}` : secondsLeft}`;

  return (
    <View style={[styles.container, { height: size, width: size }]}>
      <Svg width={size} height={size}>
        {/* Background track circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#E2E8F0"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Animated progress ring */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={ringColor}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.textContainer}>
        <Text style={[styles.timerText, { color: ringColor }]}>
          {formattedTime}
        </Text>
      </View>
    </View>
  );
};

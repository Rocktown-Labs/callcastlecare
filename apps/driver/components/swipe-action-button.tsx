import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

interface SwipeActionButtonProps {
  label: string;
  onConfirm: () => void;
  accentColor?: string;
  variant?: "primary" | "success";
  disabled?: boolean;
}

const THUMB_SIZE = 54;
const TRACK_PADDING = 5;

const styles = StyleSheet.create({
  label: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  labelContainer: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 60,
  },
  progressFill: {
    borderRadius: 30,
    bottom: TRACK_PADDING,
    left: TRACK_PADDING,
    opacity: 0.22,
    position: "absolute",
    top: TRACK_PADDING,
  },
  thumb: {
    alignItems: "center",
    borderRadius: THUMB_SIZE / 2,
    elevation: 3,
    height: THUMB_SIZE,
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    width: THUMB_SIZE,
  },
  track: {
    borderRadius: 36,
    borderWidth: 1.5,
    height: THUMB_SIZE + TRACK_PADDING * 2,
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: TRACK_PADDING,
    position: "relative",
    width: "100%",
  },
});

export const SwipeActionButton = ({
  accentColor,
  disabled = false,
  label,
  onConfirm,
  variant = "primary",
}: SwipeActionButtonProps) => {
  const [trackWidth, setTrackWidth] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);

  const translateX = useSharedValue(0);
  const isDragging = useSharedValue(false);

  const maxSwipe = Math.max(0, trackWidth - THUMB_SIZE - TRACK_PADDING * 2);

  const themeAccent =
    accentColor ?? (variant === "success" ? "#10B981" : "#0058B8");

  const onLayout = (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    setTrackWidth(width);
  };

  const fireSuccess = () => {
    setIsCompleted(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConfirm();
  };

  // oxlint-disable-next-line react/react-compiler
  const panGesture = Gesture.Pan()
    .enabled(!disabled && !isCompleted && maxSwipe > 0)
    .onBegin(() => {
      "worklet";
      isDragging.set(true);
    })
    .onUpdate((event) => {
      "worklet";
      if (maxSwipe <= 0) {
        return;
      }
      const nextX = Math.min(Math.max(0, event.translationX), maxSwipe);
      translateX.set(nextX);
    })
    .onEnd((event) => {
      "worklet";
      isDragging.set(false);
      const commitThreshold = maxSwipe * 0.75;
      const hasFlick = event.velocityX > 600;

      if (translateX.get() >= commitThreshold || hasFlick) {
        translateX.set(
          withSpring(maxSwipe, {
            dampingRatio: 0.8,
            duration: 300,
            velocity: event.velocityX,
          })
        );
        scheduleOnRN(fireSuccess);
      } else {
        translateX.set(
          withSpring(0, {
            dampingRatio: 0.8,
            duration: 300,
            velocity: event.velocityX,
          })
        );
      }
    });

  const animatedThumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.get() }],
  }));

  const animatedProgressStyle = useAnimatedStyle(() => ({
    width: translateX.get() + THUMB_SIZE + TRACK_PADDING,
  }));

  const animatedLabelStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.get(),
      [0, maxSwipe * 0.5],
      [1, 0.15],
      "clamp"
    );
    return {
      opacity,
    };
  });

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.track,
        {
          backgroundColor: variant === "success" ? "#ECFDF5" : "#EFF6FF",
          borderColor: variant === "success" ? "#A7F3D0" : "#BFDBFE",
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.progressFill,
          { backgroundColor: themeAccent },
          animatedProgressStyle,
        ]}
      />

      <Animated.View style={[styles.labelContainer, animatedLabelStyle]}>
        <Text
          style={[
            styles.label,
            { color: variant === "success" ? "#065F46" : "#1E40AF" },
          ]}
          numberOfLines={1}
        >
          {isCompleted ? "CONFIRMED ✓" : label}
        </Text>
      </Animated.View>

      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            styles.thumb,
            { backgroundColor: themeAccent },
            animatedThumbStyle,
          ]}
        >
          <Ionicons
            name={isCompleted ? "checkmark" : "arrow-forward"}
            size={24}
            color="#FFFFFF"
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

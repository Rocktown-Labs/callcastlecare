import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface DriverHeaderProps {
  title: string;
  onBack?: () => void;
  onHelp?: () => void;
  onAction?: () => void;
  actionIcon?: keyof typeof Ionicons.glyphMap;
  subtitle?: string;
  hasNotificationBadge?: boolean;
}

const styles = StyleSheet.create({
  contentRow: {
    alignItems: "center",
    flexDirection: "row",
    height: 52,
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  headerContainer: {
    backgroundColor: "#0058B8",
    elevation: 4,
    shadowColor: "#000000",
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    zIndex: 50,
  },
  helpButtonWithBadge: {
    position: "relative",
  },
  iconButton: {
    alignItems: "center",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  iconButtonPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
  leftSlot: {
    alignItems: "flex-start",
    width: 48,
  },
  logoRow: {
    alignItems: "center",
    flexDirection: "row",
  },
  notificationDot: {
    backgroundColor: "#EF4444",
    borderColor: "#0058B8",
    borderRadius: 5,
    borderWidth: 1.5,
    height: 10,
    position: "absolute",
    right: 6,
    top: 6,
    width: 10,
  },
  rightSlot: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "flex-end",
    width: 48,
  },
  subtitleText: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 12,
    fontWeight: "400",
    marginTop: 1,
  },
  titleCenter: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  titleText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
});

export const DriverHeader = ({
  actionIcon,
  hasNotificationBadge = false,
  onAction,
  onBack,
  onHelp,
  subtitle,
  title,
}: DriverHeaderProps) => {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.headerContainer,
        {
          paddingTop: Math.max(insets.top, 12),
        },
      ]}
    >
      {/* oxlint-disable-next-line react/style-prop-object */}
      <StatusBar style="light" />
      <View style={styles.contentRow}>
        <View style={styles.leftSlot}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              style={({ pressed }) => [
                styles.iconButton,
                pressed && styles.iconButtonPressed,
              ]}
              hitSlop={8}
            >
              <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
            </Pressable>
          ) : (
            <View style={styles.logoRow}>
              <Ionicons name="shield-checkmark" size={22} color="#FFFFFF" />
            </View>
          )}
        </View>

        <View style={styles.titleCenter}>
          <Text style={styles.titleText} numberOfLines={1}>
            {title}
          </Text>
          {subtitle && (
            <Text style={styles.subtitleText} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>

        <View style={styles.rightSlot}>
          {actionIcon && onAction && (
            <Pressable
              onPress={onAction}
              style={({ pressed }) => [
                styles.iconButton,
                pressed && styles.iconButtonPressed,
              ]}
              hitSlop={8}
            >
              <Ionicons name={actionIcon} size={22} color="#FFFFFF" />
            </Pressable>
          )}

          {onHelp && (
            <Pressable
              onPress={onHelp}
              style={({ pressed }) => [
                styles.iconButton,
                styles.helpButtonWithBadge,
                pressed && styles.iconButtonPressed,
              ]}
              hitSlop={8}
            >
              <Ionicons name="help-circle-outline" size={24} color="#FFFFFF" />
              {hasNotificationBadge && <View style={styles.notificationDot} />}
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
};

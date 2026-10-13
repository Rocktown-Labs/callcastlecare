import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

interface PhotoCaptureSlotProps {
  label: string;
  photoUri?: string;
  onCapture: () => void;
  onRemove: () => void;
  required?: boolean;
}

const styles = StyleSheet.create({
  cameraIconCircle: {
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    marginBottom: 6,
    width: 48,
  },
  container: {
    marginBottom: 12,
  },
  deleteButton: {
    alignItems: "center",
    backgroundColor: "rgba(239, 68, 68, 0.85)",
    borderRadius: 14,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  emptySlot: {
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 12,
    borderStyle: "dashed",
    borderWidth: 1.5,
    justifyContent: "center",
    paddingVertical: 18,
  },
  emptySlotPressed: {
    backgroundColor: "#F1F5F9",
    transform: [{ scale: 0.99 }],
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  label: {
    color: "#1E293B",
    fontSize: 13,
    fontWeight: "600",
  },
  overlayBar: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    bottom: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    left: 0,
    paddingHorizontal: 10,
    paddingVertical: 6,
    position: "absolute",
    right: 0,
  },
  pendingText: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "500",
  },
  previewContainer: {
    borderRadius: 12,
    height: 130,
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
  previewImage: {
    backgroundColor: "#E2E8F0",
    height: "100%",
    width: "100%",
  },
  required: {
    color: "#EF4444",
  },
  statusBadge: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  statusText: {
    color: "#10B981",
    fontSize: 12,
    fontWeight: "600",
  },
  subtext: {
    color: "#94A3B8",
    fontSize: 11,
  },
  tapToTakeText: {
    color: "#0058B8",
    fontSize: 13,
    fontWeight: "600",
  },
  timeTag: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  timeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "500",
  },
});

export const PhotoCaptureSlot = ({
  label,
  onCapture,
  onRemove,
  photoUri,
  required = true,
}: PhotoCaptureSlotProps) => (
  <View style={styles.container}>
    <View style={styles.header}>
      <Text style={styles.label}>
        {label} {required && <Text style={styles.required}>*</Text>}
      </Text>
      {photoUri ? (
        <View style={styles.statusBadge}>
          <Ionicons name="checkmark-circle" size={14} color="#10B981" />
          <Text style={styles.statusText}>Captured</Text>
        </View>
      ) : (
        <Text style={styles.pendingText}>Required</Text>
      )}
    </View>

    {photoUri ? (
      <View style={styles.previewContainer}>
        <Image source={{ uri: photoUri }} style={styles.previewImage} />
        <View style={styles.overlayBar}>
          <View style={styles.timeTag}>
            <Ionicons name="time-outline" size={12} color="#FFFFFF" />
            <Text style={styles.timeText}>Verified Photo</Text>
          </View>
          <Pressable style={styles.deleteButton} onPress={onRemove} hitSlop={8}>
            <Ionicons name="trash-outline" size={16} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>
    ) : (
      <Pressable
        style={({ pressed }) => [
          styles.emptySlot,
          pressed && styles.emptySlotPressed,
        ]}
        onPress={onCapture}
      >
        <View style={styles.cameraIconCircle}>
          <Ionicons name="camera" size={24} color="#0058B8" />
        </View>
        <Text style={styles.tapToTakeText}>Tap to Take Photo</Text>
        <Text style={styles.subtext}>Clear angle, good lighting</Text>
      </Pressable>
    )}
  </View>
);

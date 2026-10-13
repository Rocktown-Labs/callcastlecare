import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { DeliveryZone } from "@/lib/types";

interface ZoneSelectorModalProps {
  visible: boolean;
  onClose: () => void;
  currentZone: DeliveryZone;
  availableZones: DeliveryZone[];
  onSelectZone: (zoneId: string) => void;
}

const styles = StyleSheet.create({
  boldZone: {
    color: "#0F172A",
    fontWeight: "700",
  },
  bulbIcon: {
    marginRight: 10,
    marginTop: 2,
  },
  container: {
    backgroundColor: "#F8FAFC",
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  currentZoneLabel: {
    color: "#64748B",
    fontSize: 14,
    marginBottom: 16,
  },
  header: {
    alignItems: "center",
    backgroundColor: "#0058B8",
    flexDirection: "row",
    height: 54,
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  headerIconBtn: {
    alignItems: "center",
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  headerSaveBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerSaveText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  infoCallout: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 20,
    padding: 12,
  },
  infoText: {
    color: "#1E3A8A",
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    color: "#0F172A",
    flex: 1,
    fontSize: 16,
    paddingVertical: 12,
  },
  inputContainer: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  radioInner: {
    backgroundColor: "#0058B8",
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  radioOuter: {
    alignItems: "center",
    borderColor: "#0058B8",
    borderRadius: 11,
    borderWidth: 2,
    height: 22,
    justifyContent: "center",
    marginRight: 14,
    width: 22,
  },
  searchHeading: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  searchIcon: {
    marginRight: 8,
  },
  zoneItem: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 10,
    padding: 14,
  },
  zoneItemSelected: {
    borderColor: "#0058B8",
    borderWidth: 1.5,
  },
  zoneName: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "600",
  },
  zoneSub: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 2,
  },
  zoneTextCol: {
    flex: 1,
  },
  zonesList: {
    marginTop: 4,
  },
});

export const ZoneSelectorModal = ({
  availableZones,
  currentZone,
  onClose,
  onSelectZone,
  visible,
}: ZoneSelectorModalProps) => {
  const insets = useSafeAreaInsets();
  const [selectedId, setSelectedId] = useState(currentZone.id);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredZones = availableZones.filter((zone) => {
    if (!searchQuery.trim()) {
      return true;
    }
    const query = searchQuery.trim().toLowerCase();
    const matchesName = zone.name.toLowerCase().includes(query);
    const matchesZip = zone.zipCodes.some((zip) => zip.includes(query));
    return matchesName || matchesZip;
  });

  const handleSave = () => {
    onSelectZone(selectedId);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        style={[styles.container, { paddingTop: Math.max(insets.top, 12) }]}
      >
        {/* Header matching Screenshot 10 */}
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.headerIconBtn} hitSlop={8}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Change your zone</Text>
          <Pressable
            onPress={handleSave}
            style={styles.headerSaveBtn}
            hitSlop={8}
          >
            <Text style={styles.headerSaveText}>Save</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Current Zone indicator */}
          <Text style={styles.currentZoneLabel}>
            Current Zone:{" "}
            <Text style={styles.boldZone}>{currentZone.name}</Text>
          </Text>

          {/* Search Input */}
          <Text style={styles.searchHeading}>Search zones</Text>
          <View style={styles.inputContainer}>
            <Ionicons
              name="search"
              size={18}
              color="#94A3B8"
              style={styles.searchIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="Enter a city or ZIP code"
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              keyboardType="default"
              autoCapitalize="none"
            />
            {searchQuery ? (
              <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color="#94A3B8" />
              </Pressable>
            ) : null}
          </View>

          {/* Info callout */}
          <View style={styles.infoCallout}>
            <Ionicons
              name="bulb-outline"
              size={20}
              color="#0058B8"
              style={styles.bulbIcon}
            />
            <Text style={styles.infoText}>
              You can only be assigned to one dispatch zone at a time, but you
              can change zones as often as you like.
            </Text>
          </View>

          {/* Zones list */}
          <View style={styles.zonesList}>
            {filteredZones.map((zone) => {
              const isSelected = zone.id === selectedId;
              return (
                <Pressable
                  key={zone.id}
                  style={[
                    styles.zoneItem,
                    isSelected && styles.zoneItemSelected,
                  ]}
                  onPress={() => setSelectedId(zone.id)}
                >
                  <View style={styles.radioOuter}>
                    {isSelected && <View style={styles.radioInner} />}
                  </View>
                  <View style={styles.zoneTextCol}>
                    <Text style={styles.zoneName}>{zone.name}</Text>
                    <Text style={styles.zoneSub}>
                      {zone.pickupPointsCount} Service hubs in this area · ZIPs:{" "}
                      {zone.zipCodes.join(", ")}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

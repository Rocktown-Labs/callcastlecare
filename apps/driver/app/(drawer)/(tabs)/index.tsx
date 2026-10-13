import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ActiveJobSheet } from "@/components/active-job-sheet";
import { BusyTimesChart } from "@/components/busy-times-chart";
import { IncomingOfferModal } from "@/components/incoming-offer-modal";
import { MapCanvas } from "@/components/map-canvas";
import { ZoneSelectorModal } from "@/components/zone-selector-modal";
import { useDriverState } from "@/contexts/driver-state-context";

const handleSafetyShieldPress = () => {
  Alert.alert(
    "CastleCare Safety Center",
    "Emergency assistance, roadside help, and CastleCare dispatch hotline (24/7) are always available while driving.\n\nDispatch Phone: (501) 555-0199",
    [
      { style: "cancel", text: "Cancel" },
      {
        onPress: () => {
          void Linking.openURL("tel:5015550199");
        },
        text: "Call Dispatch",
      },
    ]
  );
};

const styles = StyleSheet.create({
  activeJobWrapper: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#F8FAFC",
    zIndex: 100,
  },
  bottomDrawer: {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    elevation: 8,
    maxHeight: 380,
    paddingHorizontal: 16,
    paddingTop: 12,
    shadowColor: "#000000",
    shadowOffset: { height: -2, width: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  changeZoneBtn: {
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderRadius: 8,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  changeZoneText: {
    color: "#0058B8",
    fontSize: 12,
    fontWeight: "700",
  },
  container: {
    backgroundColor: "#E5F3D6",
    flex: 1,
    position: "relative",
  },
  demoCard: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
    padding: 12,
  },
  demoChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  demoHeading: {
    color: "#1E3A8A",
    fontSize: 12,
    fontWeight: "700",
  },
  demoOfferChip: {
    alignItems: "center",
    backgroundColor: "#0058B8",
    borderRadius: 14,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  demoOfferText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  fabButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    elevation: 4,
    height: 44,
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    width: 44,
  },
  fabColumn: {
    gap: 10,
    position: "absolute",
    right: 16,
    zIndex: 40,
  },
  findingDot: {
    backgroundColor: "#10B981",
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  findingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  findingText: {
    color: "#047857",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  onlineToggleBtn: {
    alignItems: "center",
    backgroundColor: "#0058B8",
    borderRadius: 24,
    elevation: 3,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: "#000000",
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
  },
  onlineToggleBtnActive: {
    backgroundColor: "#10B981",
  },
  onlineToggleText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  statusCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    elevation: 4,
    padding: 14,
    shadowColor: "#000000",
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
  },
  topCardRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  topFloatingContainer: {
    left: 16,
    position: "absolute",
    right: 16,
    zIndex: 50,
  },
  zoneName: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "700",
  },
  zoneTextCol: {
    flex: 1,
    marginRight: 8,
  },
});

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const {
    acceptOffer,
    activeJob,
    availableZones,
    currentOffer,
    currentZone,
    declineOffer,
    isOnline,
    lastCompletedJob,
    setZone,
    toggleOnline,
    triggerMockOffer,
  } = useDriverState();

  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);

  const hasJobOverlay = Boolean(activeJob || lastCompletedJob);

  const handleRecenter = () => {
    Alert.alert("Map Centered", `Centered on ${currentZone.name}`);
  };

  return (
    <View style={styles.container}>
      {/* Background vector map showing roads, river, hubs */}
      <MapCanvas hasRoute={Boolean(activeJob)} showHotspots={!activeJob} />

      {/* Floating Header Card at Top (matching Spark dispatch bar) */}
      <View
        style={[
          styles.topFloatingContainer,
          { top: Math.max(insets.top + 8, 16) },
        ]}
      >
        <View style={styles.statusCard}>
          <View style={styles.topCardRow}>
            <View style={styles.zoneTextCol}>
              <Text style={styles.zoneName}>{currentZone.name}</Text>
              {isOnline ? (
                <View style={styles.findingRow}>
                  <View style={styles.findingDot} />
                  <Text style={styles.findingText}>FINDING OFFERS...</Text>
                </View>
              ) : (
                <Pressable
                  style={styles.changeZoneBtn}
                  onPress={() => setIsZoneModalOpen(true)}
                  hitSlop={6}
                >
                  <Ionicons name="location-outline" size={14} color="#0058B8" />
                  <Text style={styles.changeZoneText}>Change zone</Text>
                </Pressable>
              )}
            </View>

            {/* Online / Offline switch pill */}
            <Pressable
              style={[
                styles.onlineToggleBtn,
                isOnline && styles.onlineToggleBtnActive,
              ]}
              onPress={toggleOnline}
            >
              <Ionicons
                name={isOnline ? "radio-button-on" : "power"}
                size={16}
                color="#FFFFFF"
              />
              <Text style={styles.onlineToggleText}>
                {isOnline ? "ONLINE" : "GO ONLINE"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Floating Action Buttons */}
      <View style={[styles.fabColumn, { top: Math.max(insets.top + 90, 100) }]}>
        <Pressable
          style={styles.fabButton}
          onPress={handleSafetyShieldPress}
          hitSlop={6}
        >
          <Ionicons name="shield-checkmark" size={22} color="#0058B8" />
        </Pressable>
        <Pressable
          style={styles.fabButton}
          onPress={handleRecenter}
          hitSlop={6}
        >
          <Ionicons name="locate" size={22} color="#475569" />
        </Pressable>
      </View>

      {/* Bottom Collapsible Sheet: Popular offer times & Demo Test Triggers */}
      {!hasJobOverlay && (
        <View
          style={[
            styles.bottomDrawer,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Busy Times Chart */}
            <BusyTimesChart />

            {/* Quick Demo Simulator triggers for testing workflow */}
            <View style={styles.demoCard}>
              <Text style={styles.demoHeading}>
                Dispatch Simulator (Tap to Test Order Lifecycle):
              </Text>
              <View style={styles.demoChipsRow}>
                <Pressable
                  style={styles.demoOfferChip}
                  onPress={() => triggerMockOffer("lawncare")}
                >
                  <Ionicons name="leaf" size={12} color="#FFFFFF" />
                  <Text style={styles.demoOfferText}>Lawn Care ($42)</Text>
                </Pressable>

                <Pressable
                  style={styles.demoOfferChip}
                  onPress={() => triggerMockOffer("window_washing")}
                >
                  <Ionicons name="water" size={12} color="#FFFFFF" />
                  <Text style={styles.demoOfferText}>Windows ($58)</Text>
                </Pressable>

                <Pressable
                  style={styles.demoOfferChip}
                  onPress={() => triggerMockOffer("laundry")}
                >
                  <Ionicons name="shirt" size={12} color="#FFFFFF" />
                  <Text style={styles.demoOfferText}>Laundry ($35)</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      )}

      {/* Incoming Offer Modal with countdown ring & Accept/Reject buttons */}
      <IncomingOfferModal
        offer={currentOffer}
        onAccept={acceptOffer}
        onDecline={declineOffer}
      />

      {/* Active Job Sheet covering lifecycle: Start Trip -> Arrive Swipe -> Before Photos -> Work -> After Photos -> Complete Swipe -> Payout */}
      {hasJobOverlay && (
        <View
          style={[
            styles.activeJobWrapper,
            { paddingTop: Math.max(insets.top, 12) },
          ]}
        >
          <ActiveJobSheet />
        </View>
      )}

      {/* Zone Selector Modal */}
      <ZoneSelectorModal
        visible={isZoneModalOpen}
        currentZone={currentZone}
        availableZones={availableZones}
        onSelectZone={setZone}
        onClose={() => setIsZoneModalOpen(false)}
      />
    </View>
  );
}

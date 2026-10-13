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

import { DriverHeader } from "@/components/driver-header";
import { ThemeToggle } from "@/components/theme-toggle";
import { ZoneSelectorModal } from "@/components/zone-selector-modal";
import { useDriverState } from "@/contexts/driver-state-context";
import { authClient } from "@/lib/auth-client";

const styles = StyleSheet.create({
  actionChevron: {
    marginLeft: 6,
  },
  avatarCircle: {
    alignItems: "center",
    backgroundColor: "#0058B8",
    borderRadius: 28,
    height: 56,
    justifyContent: "center",
    marginRight: 14,
    width: 56,
  },
  avatarInitials: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
  },
  container: {
    backgroundColor: "#F8FAFC",
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  driverIdText: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 2,
  },
  driverName: {
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "700",
  },
  itemIconSlot: {
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    marginRight: 12,
    width: 36,
  },
  itemRow: {
    alignItems: "center",
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  itemRowPressed: {
    backgroundColor: "#F1F5F9",
  },
  itemSub: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 1,
  },
  itemTextCol: {
    flex: 1,
  },
  itemTitle: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "600",
  },
  itemValueBadge: {
    color: "#0058B8",
    fontSize: 12,
    fontWeight: "600",
    marginRight: 4,
  },
  profileCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 16,
    borderWidth: 1,
    elevation: 2,
    marginTop: 14,
    padding: 16,
    shadowColor: "#000000",
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  profileDivider: {
    backgroundColor: "#F1F5F9",
    height: 1,
    marginVertical: 12,
  },
  profileHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
  },
  profileTextCol: {
    flex: 1,
  },
  rowDivider: {
    backgroundColor: "#F1F5F9",
    height: 1,
    marginLeft: 62,
  },
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  sectionTitle: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 20,
    textTransform: "uppercase",
  },
  signOutBtn: {
    alignItems: "center",
    backgroundColor: "#FEE2E2",
    borderColor: "#FECACA",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    height: 50,
    justifyContent: "center",
    marginBottom: 20,
    marginTop: 24,
  },
  signOutText: {
    color: "#DC2626",
    fontSize: 14,
    fontWeight: "700",
  },
  statusVerified: {
    color: "#10B981",
    fontSize: 12,
    fontWeight: "600",
  },
  tierBadge: {
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    borderRadius: 12,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tierBadgeText: {
    color: "#92400E",
    fontSize: 11,
    fontWeight: "700",
  },
  versionText: {
    color: "#94A3B8",
    fontSize: 11,
    marginBottom: 16,
    textAlign: "center",
  },
  zoneChangeLink: {
    color: "#0058B8",
    fontSize: 12,
    fontWeight: "700",
  },
  zoneLabel: {
    color: "#64748B",
    fontSize: 13,
  },
  zoneRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  zoneValue: {
    color: "#0F172A",
    fontWeight: "600",
  },
});

const handleCallSupport = () => {
  Alert.alert(
    "CastleCare Driver Dispatch",
    "Call 24/7 driver support at (501) 555-0199?",
    [
      { style: "cancel", text: "Cancel" },
      {
        onPress: () => {
          void Linking.openURL("tel:5015550199");
        },
        text: "Call Now",
      },
    ]
  );
};

const handleSignOut = () => {
  Alert.alert(
    "Sign Out",
    "Are you sure you want to sign out of CastleCare Driver?",
    [
      { style: "cancel", text: "Cancel" },
      {
        onPress: () => {
          void authClient.signOut();
        },
        style: "destructive",
        text: "Sign Out",
      },
    ]
  );
};

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const { availableZones, currentZone, setZone } = useDriverState();
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);

  return (
    <View style={styles.container}>
      <DriverHeader title="Account" subtitle="Settings & Profile" />

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Driver Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.profileHeaderRow}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitials}>CD</Text>
            </View>
            <View style={styles.profileTextCol}>
              <Text style={styles.driverName}>Cameron Davis</Text>
              <Text style={styles.driverIdText}>Driver ID: #CC-DRV-8492</Text>
            </View>
            <View style={styles.tierBadge}>
              <Ionicons name="star" size={12} color="#D97706" />
              <Text style={styles.tierBadgeText}>Gold · 4.94</Text>
            </View>
          </View>

          <View style={styles.profileDivider} />

          <View style={styles.zoneRow}>
            <Text style={styles.zoneLabel}>
              Operating Zone:{" "}
              <Text style={styles.zoneValue}>{currentZone.name}</Text>
            </Text>
            <Pressable onPress={() => setIsZoneModalOpen(true)} hitSlop={8}>
              <Text style={styles.zoneChangeLink}>Change</Text>
            </Pressable>
          </View>
        </View>

        {/* Section: Earnings & Banking */}
        <Text style={styles.sectionTitle}>Earnings & Payouts</Text>
        <View style={styles.sectionCard}>
          <Pressable
            style={({ pressed }) => [
              styles.itemRow,
              pressed && styles.itemRowPressed,
            ]}
            onPress={() =>
              Alert.alert(
                "Stripe Connect",
                "Your Stripe Connect payout account is active and verified for instant and weekly ACH payouts."
              )
            }
          >
            <View style={styles.itemIconSlot}>
              <Ionicons name="card-outline" size={18} color="#0058B8" />
            </View>
            <View style={styles.itemTextCol}>
              <Text style={styles.itemTitle}>Stripe Connect Account</Text>
              <Text style={styles.itemSub}>
                Direct deposits & instant cash outs
              </Text>
            </View>
            <Text style={styles.statusVerified}>Active ✓</Text>
            <Ionicons
              name="chevron-forward"
              size={16}
              color="#94A3B8"
              style={styles.actionChevron}
            />
          </Pressable>

          <View style={styles.rowDivider} />

          <Pressable
            style={({ pressed }) => [
              styles.itemRow,
              pressed && styles.itemRowPressed,
            ]}
            onPress={() =>
              Alert.alert(
                "Bank Account",
                "Linked Bank: Bank of America ••4291\nRouting: •••••4812"
              )
            }
          >
            <View style={styles.itemIconSlot}>
              <Ionicons name="business-outline" size={18} color="#0058B8" />
            </View>
            <View style={styles.itemTextCol}>
              <Text style={styles.itemTitle}>Direct Deposit Bank</Text>
              <Text style={styles.itemSub}>Bank of America ••4291</Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={16}
              color="#94A3B8"
              style={styles.actionChevron}
            />
          </Pressable>

          <View style={styles.rowDivider} />

          <Pressable
            style={({ pressed }) => [
              styles.itemRow,
              pressed && styles.itemRowPressed,
            ]}
            onPress={() =>
              Alert.alert(
                "Tax Documents",
                "2025 1099-NEC statements and monthly earnings summaries are available for download."
              )
            }
          >
            <View style={styles.itemIconSlot}>
              <Ionicons
                name="document-text-outline"
                size={18}
                color="#0058B8"
              />
            </View>
            <View style={styles.itemTextCol}>
              <Text style={styles.itemTitle}>Tax Documents & 1099</Text>
              <Text style={styles.itemSub}>
                View & download annual statements
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={16}
              color="#94A3B8"
              style={styles.actionChevron}
            />
          </Pressable>
        </View>

        {/* Section: Equipment & Vehicle */}
        <Text style={styles.sectionTitle}>Vehicle & CastleCare Equipment</Text>
        <View style={styles.sectionCard}>
          <View style={styles.itemRow}>
            <View style={styles.itemIconSlot}>
              <Ionicons name="car-outline" size={18} color="#0058B8" />
            </View>
            <View style={styles.itemTextCol}>
              <Text style={styles.itemTitle}>Vehicle</Text>
              <Text style={styles.itemSub}>
                2022 Ford F-150 · White · Verified
              </Text>
            </View>
            <Text style={styles.statusVerified}>Active ✓</Text>
          </View>

          <View style={styles.rowDivider} />

          <View style={styles.itemRow}>
            <View style={styles.itemIconSlot}>
              <Ionicons name="leaf-outline" size={18} color="#0058B8" />
            </View>
            <View style={styles.itemTextCol}>
              <Text style={styles.itemTitle}>Lawn Care Equipment</Text>
              <Text style={styles.itemSub}>
                Commercial mower, string trimmer, leaf blower
              </Text>
            </View>
            <Text style={styles.statusVerified}>Approved ✓</Text>
          </View>

          <View style={styles.rowDivider} />

          <View style={styles.itemRow}>
            <View style={styles.itemIconSlot}>
              <Ionicons name="water-outline" size={18} color="#0058B8" />
            </View>
            <View style={styles.itemTextCol}>
              <Text style={styles.itemTitle}>Window Washing Kit</Text>
              <Text style={styles.itemSub}>
                Water-fed poles, squeegees, microfiber towels
              </Text>
            </View>
            <Text style={styles.statusVerified}>Approved ✓</Text>
          </View>

          <View style={styles.rowDivider} />

          <View style={styles.itemRow}>
            <View style={styles.itemIconSlot}>
              <Ionicons name="shirt-outline" size={18} color="#0058B8" />
            </View>
            <View style={styles.itemTextCol}>
              <Text style={styles.itemTitle}>Laundry Transport Bags</Text>
              <Text style={styles.itemSub}>
                Waterproof sorting hampers & luggage scale
              </Text>
            </View>
            <Text style={styles.statusVerified}>Approved ✓</Text>
          </View>
        </View>

        {/* Section: App Preferences */}
        <Text style={styles.sectionTitle}>App Preferences</Text>
        <View style={styles.sectionCard}>
          <View style={styles.itemRow}>
            <View style={styles.itemIconSlot}>
              <Ionicons name="contrast-outline" size={18} color="#0058B8" />
            </View>
            <View style={styles.itemTextCol}>
              <Text style={styles.itemTitle}>Theme</Text>
              <Text style={styles.itemSub}>Light or dark interface</Text>
            </View>
            <ThemeToggle />
          </View>

          <View style={styles.rowDivider} />

          <Pressable
            style={({ pressed }) => [
              styles.itemRow,
              pressed && styles.itemRowPressed,
            ]}
            onPress={() =>
              Alert.alert(
                "Navigation App",
                "Google Maps is set as your default navigation app."
              )
            }
          >
            <View style={styles.itemIconSlot}>
              <Ionicons name="navigate-outline" size={18} color="#0058B8" />
            </View>
            <View style={styles.itemTextCol}>
              <Text style={styles.itemTitle}>Navigation Preference</Text>
              <Text style={styles.itemSub}>Google Maps</Text>
            </View>
            <Text style={styles.itemValueBadge}>Google Maps</Text>
            <Ionicons
              name="chevron-forward"
              size={16}
              color="#94A3B8"
              style={styles.actionChevron}
            />
          </Pressable>
        </View>

        {/* Section: Support */}
        <Text style={styles.sectionTitle}>Help & Safety</Text>
        <View style={styles.sectionCard}>
          <Pressable
            style={({ pressed }) => [
              styles.itemRow,
              pressed && styles.itemRowPressed,
            ]}
            onPress={handleCallSupport}
          >
            <View style={styles.itemIconSlot}>
              <Ionicons name="headset-outline" size={18} color="#0058B8" />
            </View>
            <View style={styles.itemTextCol}>
              <Text style={styles.itemTitle}>CastleCare Driver Support</Text>
              <Text style={styles.itemSub}>24/7 dedicated dispatch team</Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={16}
              color="#94A3B8"
              style={styles.actionChevron}
            />
          </Pressable>

          <View style={styles.rowDivider} />

          <Pressable
            style={({ pressed }) => [
              styles.itemRow,
              pressed && styles.itemRowPressed,
            ]}
            onPress={() =>
              Alert.alert(
                "Driver Guidelines",
                "Always wear CastleCare high-visibility vest on client property. Capture clear before and after photos. Verify gate latch closure upon departure."
              )
            }
          >
            <View style={styles.itemIconSlot}>
              <Ionicons name="shield-outline" size={18} color="#0058B8" />
            </View>
            <View style={styles.itemTextCol}>
              <Text style={styles.itemTitle}>Safety & Service Guidelines</Text>
              <Text style={styles.itemSub}>
                Standards for five-star quality
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={16}
              color="#94A3B8"
              style={styles.actionChevron}
            />
          </Pressable>
        </View>

        {/* Sign Out button */}
        <Pressable
          style={({ pressed }) => [
            styles.signOutBtn,
            pressed && { opacity: 0.8 },
          ]}
          onPress={handleSignOut}
        >
          <Ionicons name="log-out-outline" size={18} color="#DC2626" />
          <Text style={styles.signOutText}>Sign Out of CastleCare Driver</Text>
        </Pressable>

        <Text style={styles.versionText}>
          CastleCare Driver v1.0.0 (Build 42) · Searcy, AR
        </Text>
      </ScrollView>

      {/* Zone Selector modal */}
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

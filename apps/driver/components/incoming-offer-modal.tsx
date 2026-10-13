import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { DispatchOffer } from "@/lib/types";

import { OfferCountdownRing } from "./offer-countdown-ring";

interface IncomingOfferModalProps {
  offer: DispatchOffer | null;
  onAccept: (offer: DispatchOffer) => void;
  onDecline: () => void;
}

const styles = StyleSheet.create({
  acceptBtn: {
    alignItems: "center",
    backgroundColor: "#0058B8",
    borderRadius: 28,
    flex: 1,
    height: 52,
    justifyContent: "center",
  },
  acceptBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  addressBox: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
    padding: 14,
  },
  addressLine: {
    color: "#475569",
    fontSize: 13,
    marginTop: 2,
  },
  backdrop: {
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    flex: 1,
    justifyContent: "space-between",
  },
  btnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  buttonsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 6,
  },
  cardContainer: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    elevation: 10,
    maxHeight: "82%",
    paddingHorizontal: 20,
    paddingTop: 16,
    shadowColor: "#000000",
    shadowOffset: { height: -4, width: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  cardHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  customerName: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "600",
    marginTop: 2,
  },
  expiredBody: {
    color: "#64748B",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
    textAlign: "center",
  },
  expiredContainer: {
    alignItems: "center",
    paddingVertical: 24,
  },
  expiredIcon: {
    alignItems: "center",
    backgroundColor: "#FEE2E2",
    borderRadius: 32,
    height: 64,
    justifyContent: "center",
    marginBottom: 16,
    width: 64,
  },
  expiredTitle: {
    color: "#0F172A",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },
  gotItBtn: {
    alignItems: "center",
    backgroundColor: "#0058B8",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    width: "100%",
  },
  gotItBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  justForYouBadge: {
    backgroundColor: "#EFF6FF",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  justForYouText: {
    color: "#0058B8",
    fontSize: 12,
    fontWeight: "700",
  },
  notesBox: {
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    padding: 8,
  },
  notesText: {
    color: "#1E3A8A",
    flex: 1,
    fontSize: 12,
  },
  payoutAmount: {
    color: "#0F172A",
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  payoutRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  pill: {
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pillText: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "600",
  },
  pillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  pushBanner: {
    alignItems: "center",
    backgroundColor: "#1E293B",
    borderRadius: 16,
    elevation: 6,
    flexDirection: "row",
    marginHorizontal: 16,
    padding: 12,
    shadowColor: "#000000",
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  pushBody: {
    color: "#CBD5E1",
    fontSize: 12,
    marginTop: 1,
  },
  pushIcon: {
    alignItems: "center",
    backgroundColor: "#0058B8",
    borderRadius: 10,
    height: 36,
    justifyContent: "center",
    marginRight: 10,
    width: 36,
  },
  pushTextCol: {
    flex: 1,
  },
  pushTime: {
    color: "#94A3B8",
    fontSize: 11,
    marginLeft: 6,
  },
  pushTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  rejectBtn: {
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderColor: "#CBD5E1",
    borderRadius: 28,
    borderWidth: 1,
    flex: 1,
    height: 52,
    justifyContent: "center",
  },
  rejectBtnText: {
    color: "#475569",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  scheduledTime: {
    color: "#0058B8",
    fontSize: 12,
    fontWeight: "700",
  },
  scopeBox: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
    padding: 10,
  },
  scopeItem: {
    color: "#334155",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  scopeTitle: {
    color: "#0F172A",
    fontSize: 12,
    fontWeight: "700",
  },
  scrollContent: {
    paddingBottom: 10,
  },
  serviceTag: {
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderRadius: 14,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  serviceTagText: {
    color: "#0058B8",
    fontSize: 12,
    fontWeight: "600",
  },
  statsOverview: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 12,
  },
  stopDot: {
    alignItems: "center",
    backgroundColor: "#0058B8",
    borderRadius: 12,
    height: 24,
    justifyContent: "center",
    marginRight: 10,
    marginTop: 2,
    width: 24,
  },
  stopInfo: {
    flex: 1,
  },
  timelineRow: {
    flexDirection: "row",
  },
});

const getServiceIcon = (type: string): keyof typeof Ionicons.glyphMap => {
  if (type === "lawncare") {
    return "leaf";
  }
  if (type === "window_washing") {
    return "water";
  }
  return "shirt";
};

const getServiceBadgeLabel = (type: string): string => {
  if (type === "lawncare") {
    return "Lawn Care Service";
  }
  if (type === "window_washing") {
    return "Window Washing";
  }
  return "Laundry Wash & Fold";
};

interface OfferContentProps {
  offer: DispatchOffer;
  onAccept: (offer: DispatchOffer) => void;
  onDecline: () => void;
}

const OfferContent = ({ offer, onAccept, onDecline }: OfferContentProps) => {
  const insets = useSafeAreaInsets();
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setIsExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const totalPayout = (offer.totalPayoutCents / 100).toFixed(2);
  const basePay = (offer.basePayCents / 100).toFixed(2);
  const tipPay = (offer.tipAmountCents / 100).toFixed(2);

  const serviceIcon = getServiceIcon(offer.serviceType);
  const serviceBadgeLabel = getServiceBadgeLabel(offer.serviceType);

  return (
    <View style={styles.backdrop}>
      {/* Top Push Alert Notification Banner (matching Screenshot 12) */}
      <View
        style={[styles.pushBanner, { marginTop: Math.max(insets.top + 8, 20) }]}
      >
        <View style={styles.pushIcon}>
          <Ionicons name="sparkles" size={18} color="#FFFFFF" />
        </View>
        <View style={styles.pushTextCol}>
          <Text style={styles.pushTitle}>CastleCare Dispatch</Text>
          <Text style={styles.pushBody}>
            New high-priority offer available. Accept within 60s!
          </Text>
        </View>
        <Text style={styles.pushTime}>now</Text>
      </View>

      {/* Modal Card / Bottom Sheet */}
      <View
        style={[
          styles.cardContainer,
          { paddingBottom: Math.max(insets.bottom, 16) },
        ]}
      >
        {isExpired ? (
          <View style={styles.expiredContainer}>
            <View style={styles.expiredIcon}>
              <Ionicons name="time-outline" size={32} color="#EF4444" />
            </View>
            <Text style={styles.expiredTitle}>Offer Expired</Text>
            <Text style={styles.expiredBody}>
              This dispatch offer was reclaimed because the 60-second window
              passed. Don&apos;t worry, more offers are coming!
            </Text>
            <Pressable style={styles.gotItBtn} onPress={onDecline}>
              <Text style={styles.gotItBtnText}>GOT IT</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Card Header matching Screenshot 14 */}
            <View style={styles.cardHeaderRow}>
              <View style={styles.serviceTag}>
                <Ionicons name={serviceIcon} size={14} color="#0058B8" />
                <Text style={styles.serviceTagText}>{serviceBadgeLabel}</Text>
              </View>
              <View style={styles.justForYouBadge}>
                <Text style={styles.justForYouText}>Just for you</Text>
              </View>
            </View>

            {/* Total Payout & Countdown Timer Ring */}
            <View style={styles.payoutRow}>
              <View>
                <Text style={styles.payoutAmount}>${totalPayout}</Text>
                <Text style={styles.scheduledTime}>
                  {offer.pickupTime} · 1 Job
                </Text>
              </View>
              <OfferCountdownRing secondsLeft={secondsLeft} size={50} />
            </View>

            {/* Pills row (Base pay, Tip, Distance) */}
            <View style={styles.pillsRow}>
              <View style={styles.pill}>
                <Text style={styles.pillText}>Base: ${basePay}</Text>
              </View>
              {offer.tipAmountCents > 0 && (
                <View style={styles.pill}>
                  <Text style={styles.pillText}>+${tipPay} Tip</Text>
                </View>
              )}
              <View style={styles.pill}>
                <Ionicons name="navigate-outline" size={12} color="#64748B" />
                <Text style={styles.pillText}>{offer.distanceMiles} mi</Text>
              </View>
              <View style={styles.pill}>
                <Ionicons name="time-outline" size={12} color="#64748B" />
                <Text style={styles.pillText}>{offer.durationMinutes} min</Text>
              </View>
            </View>

            <Text style={styles.statsOverview}>
              1 Service Stop · {offer.city}, AR {offer.zip}
            </Text>

            {/* Destination Address & Scope box */}
            <View style={styles.addressBox}>
              <View style={styles.timelineRow}>
                <View style={styles.stopDot}>
                  <Ionicons name="location" size={14} color="#FFFFFF" />
                </View>
                <View style={styles.stopInfo}>
                  <Text style={styles.customerName}>{offer.customerName}</Text>
                  <Text style={styles.addressLine}>{offer.address}</Text>
                </View>
              </View>

              {/* Scope details */}
              <View style={styles.scopeBox}>
                <Text style={styles.scopeTitle}>Service Scope</Text>
                <Text style={styles.scopeItem}>• {offer.title}</Text>
                <Text style={styles.scopeItem}>• {offer.subtitle}</Text>
              </View>

              {offer.propertyNotes ? (
                <View style={styles.notesBox}>
                  <Ionicons
                    name="information-circle"
                    size={14}
                    color="#0058B8"
                  />
                  <Text style={styles.notesText}>{offer.propertyNotes}</Text>
                </View>
              ) : null}
            </View>

            {/* Buttons: REJECT / ACCEPT (matching Screenshot 14) */}
            <View style={styles.buttonsRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.rejectBtn,
                  pressed && styles.btnPressed,
                ]}
                onPress={onDecline}
              >
                <Text style={styles.rejectBtnText}>REJECT</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.acceptBtn,
                  pressed && styles.btnPressed,
                ]}
                onPress={() => onAccept(offer)}
              >
                <Text style={styles.acceptBtnText}>ACCEPT</Text>
              </Pressable>
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  );
};

export const IncomingOfferModal = ({
  offer,
  onAccept,
  onDecline,
}: IncomingOfferModalProps) => {
  if (!offer) {
    return null;
  }

  return (
    <Modal visible={!!offer} transparent animationType="slide">
      <OfferContent
        key={offer.id}
        offer={offer}
        onAccept={onAccept}
        onDecline={onDecline}
      />
    </Modal>
  );
};

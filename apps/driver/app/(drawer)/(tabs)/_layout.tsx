import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useThemeColor } from "heroui-native";
import React from "react";
import type { ColorValue } from "react-native";

interface TabIconProps {
  color: ColorValue;
  size: number;
}

const HomeTabIcon = ({ color, size }: TabIconProps) => (
  <Ionicons name="home" size={size} color={color} />
);

const TripsTabIcon = ({ color, size }: TabIconProps) => (
  <Ionicons name="car" size={size} color={color} />
);

const EarningsTabIcon = ({ color, size }: TabIconProps) => (
  <Ionicons name="cash" size={size} color={color} />
);

const IncentivesTabIcon = ({ color, size }: TabIconProps) => (
  <Ionicons name="ribbon" size={size} color={color} />
);

const MoreTabIcon = ({ color, size }: TabIconProps) => (
  <Ionicons name="ellipsis-horizontal" size={size} color={color} />
);

const TabLayout = () => {
  const themeColorBackground = useThemeColor("background");

  return (
    <Tabs
      screenOptions={{
        animation: "none",
        headerShown: false,
        tabBarActiveTintColor: "#0058B8",
        tabBarInactiveTintColor: "#8E8E93",
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
        tabBarStyle: {
          backgroundColor: themeColorBackground,
          borderTopColor: "#E2E8F0",
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: HomeTabIcon,
          title: "Home",
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          tabBarIcon: TripsTabIcon,
          title: "Trips",
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          tabBarIcon: EarningsTabIcon,
          title: "Earnings",
        }}
      />
      <Tabs.Screen
        name="incentives"
        options={{
          tabBarIcon: IncentivesTabIcon,
          title: "Incentives",
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          tabBarIcon: MoreTabIcon,
          title: "More",
        }}
      />
    </Tabs>
  );
};

export default TabLayout;

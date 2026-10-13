import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useThemeColor } from "heroui-native";
import type { ColorValue } from "react-native";

interface TabIconProps {
  color: ColorValue;
  size: number;
}

const HomeTabIcon = ({ color, size }: TabIconProps) => (
  <Ionicons name="home" size={size} color={color} />
);

const ExploreTabIcon = ({ color, size }: TabIconProps) => (
  <Ionicons name="compass" size={size} color={color} />
);

const TabLayout = () => {
  const themeColorForeground = useThemeColor("foreground");
  const themeColorBackground = useThemeColor("background");

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        headerStyle: {
          backgroundColor: themeColorBackground,
        },
        headerTintColor: themeColorForeground,
        headerTitleStyle: {
          color: themeColorForeground,
          fontWeight: "600",
        },
        tabBarStyle: {
          backgroundColor: themeColorBackground,
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
        name="two"
        options={{
          tabBarIcon: ExploreTabIcon,
          title: "Explore",
        }}
      />
    </Tabs>
  );
};

export default TabLayout;

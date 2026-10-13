import "@/global.css";
import { Stack } from "expo-router";
import { HeroUINativeProvider } from "heroui-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { AppThemeProvider } from "@/contexts/app-theme-context";
import { DriverStateProvider } from "@/contexts/driver-state-context";

export const unstable_settings = {
  initialRouteName: "(drawer)",
};

const StackLayout = () => (
  <Stack screenOptions={{}}>
    <Stack.Screen name="(drawer)" options={{ headerShown: false }} />
    <Stack.Screen
      name="modal"
      options={{ presentation: "modal", title: "Modal" }}
    />
  </Stack>
);

export default function Layout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <AppThemeProvider>
          <HeroUINativeProvider>
            <DriverStateProvider>
              <StackLayout />
            </DriverStateProvider>
          </HeroUINativeProvider>
        </AppThemeProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

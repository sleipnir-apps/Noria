import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import { Stack } from "expo-router";
import Head from "expo-router/head";
import * as SplashScreen from "expo-splash-screen";
import { useColorScheme } from "react-native";

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { AppProviders } from "@/lib/app-providers";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import {
  BackendErrorScreen,
  BackendLoadingScreen,
  useBackendStatus,
} from "@/components/backend-status";

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { isLoading, isError, isAuthenticated } = useAuthGuard();
  const { isSlow, refetch } = useBackendStatus();

  if (isLoading) return <BackendLoadingScreen isSlow={isSlow} />;
  if (isError) return <BackendErrorScreen onRefresh={() => refetch()} />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AppProviders>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <Head>
          <title>Noria</title>
          <meta name="description" content="Noria" />
        </Head>
        <AnimatedSplashOverlay />
        <RootNavigator />
      </ThemeProvider>
    </AppProviders>
  );
}

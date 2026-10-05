import { Stack } from "expo-router";
import { useColorScheme } from "react-native";
import { Colors } from "@/constants/theme";
import { useSyncEngine } from "@/features/sync/use-sync";

export default function AppLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === "dark" ? "dark" : "light"];

  // Offline-first engine: replays the mutation queue on reconnection and pulls
  // server changes. One instance at the app root (below authentication).
  useSyncEngine();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.primary,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: "600", color: colors.text },
        headerBackTitle: "Retour",
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="task-editor" options={{ title: "Tâche" }} />
    </Stack>
  );
}

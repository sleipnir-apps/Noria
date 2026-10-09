import { Stack } from "expo-router";
import { useColorScheme } from "react-native";
import { Colors } from "@/constants/theme";
import { useTaskSync } from "@/features/tasks/use-task-sync";

export default function AppLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === "dark" ? "dark" : "light"];

  // Hydrate the offline dataset + run the sync engine while signed in.
  useTaskSync();

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

import { Stack } from "expo-router";
import { useColorScheme } from "react-native";
import { Colors } from "@/constants/theme";

export default function AppLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === "dark" ? "dark" : "light"];

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
      <Stack.Screen name="items/[id]" options={{ title: "Détail Item" }} />
      <Stack.Screen
        name="task-editor"
        options={{ title: "Éditeur de tâche", presentation: "modal" }}
      />
    </Stack>
  );
}

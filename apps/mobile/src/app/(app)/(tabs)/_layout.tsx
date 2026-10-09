import { Tabs } from "expo-router";
import { useColorScheme } from "react-native";
import { Colors } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";

export default function TabsLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === "dark" ? "dark" : "light"];

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
        },
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { color: colors.text, fontWeight: "600" },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Aujourd'hui",
          tabBarLabel: "Aujourd'hui",
          tabBarIcon: ({ color, size }) => <Ionicons name="today" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="upcoming"
        options={{
          title: "À venir",
          tabBarLabel: "À venir",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-number" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="backlog"
        options={{
          title: "Backlog",
          tabBarLabel: "Backlog",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="folder-open" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Mon Profil",
          tabBarLabel: "Profil",
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

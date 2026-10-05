/**
 * Offline banner — "hors ligne / en attente de sync" indicator.
 * One instance in the app layout; reflects the sync engine status.
 */
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { ThemedText } from "@/components/themed-text";
import { FontSizes, Radius, Spacing, useTheme } from "@/lib/ui";
import { useSyncStatus } from "@/features/sync/use-sync";

export function OfflineBanner() {
  const theme = useTheme();
  const { status, pendingCount, syncNow } = useSyncStatus();

  if (status === "online" && pendingCount === 0) return null;

  const offline = status === "offline";
  const label = offline
    ? "Hors ligne — les modifications sont enregistrées localement"
    : status === "syncing"
      ? "Synchronisation…"
      : `${pendingCount} modification(s) en attente de sync`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={syncNow}
      style={({ pressed }) => [
        styles.banner,
        {
          backgroundColor: offline ? theme.danger : theme.primary,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.row}>
        <Ionicons name={offline ? "cloud-offline" : "sync"} size={14} color="#fff" />
        <ThemedText type="small" style={styles.text}>
          {label}
          {!offline && pendingCount > 0 ? " — toucher pour réessayer" : ""}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    marginBottom: Spacing.two,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  text: {
    color: "#fff",
    fontSize: FontSizes.xs,
    fontWeight: "600",
  },
});

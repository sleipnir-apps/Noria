import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet } from "react-native";
import { Radius, Spacing } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useTheme } from "@/hooks/use-theme";
import { useTasksState } from "@/features/tasks/use-tasks";
import { syncNow } from "@/features/tasks/sync-engine";

/**
 * Offline / pending-sync indicator. Shown whenever the last sync failed
 * (offline or API error) or when mutations are queued. Online state: a tap
 * forces a resync; offline state: the queue stays until the connection
 * returns (the engine retries every minute and on reconnect).
 */
export function OfflineBanner() {
  const theme = useTheme();
  const state = useTasksState();

  if (!state.hydrated) return null;

  const offline = state.isOffline;
  const pending = state.queue.length;
  if (!offline && pending === 0) return null;

  return (
    <ThemedView
      style={[styles.banner, { backgroundColor: offline ? theme.danger : theme.backgroundElement }]}
    >
      <Ionicons
        name={offline ? "cloud-offline" : "sync"}
        size={14}
        color={offline ? theme.onPrimary : theme.textSecondary}
      />
      <ThemedText
        type="small"
        themeColor={offline ? "onPrimary" : "textSecondary"}
        style={styles.text}
      >
        {offline
          ? "Hors ligne — modifications gardées en attente"
          : pending === 1
            ? "1 modification en attente de synchronisation"
            : `${pending} modifications en attente de synchronisation`}
      </ThemedText>
      <Pressable onPress={syncNow} hitSlop={8} accessibilityLabel="Synchroniser maintenant">
        {state.isSyncing ? (
          <ThemedText type="small" themeColor={offline ? "onPrimary" : "textSecondary"}>
            …
          </ThemedText>
        ) : (
          <Ionicons name="refresh" size={16} color={offline ? theme.onPrimary : theme.primary} />
        )}
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  text: {
    flex: 1,
  },
});

import { StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";
import { taskQueue } from "@/features/tasks/task-queue";
import { useEffect, useState } from "react";

/**
 * Offline / pending-sync indicator: shows a small banner while ops are queued
 * or the device is offline. Live, re-checked every couple of seconds.
 */
export function SyncStatusBanner() {
  const theme = useTheme();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let alive = true;
    const check = () => {
      void taskQueue.count().then((n) => {
        if (alive) setPending(n);
      });
    };
    check();
    const timer = setInterval(check, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  if (pending === 0) return null;

  return (
    <View style={[styles.banner, { backgroundColor: theme.backgroundSelected }]}>
      <ThemedText themeColor="textSecondary" style={styles.text}>
        {pending > 0
          ? `${pending} modification${pending > 1 ? "s" : ""} en attente de sync`
          : "Hors ligne"}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
    marginHorizontal: 16,
    marginTop: 8,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 12,
  },
});

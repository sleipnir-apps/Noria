import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { OfflineBanner } from "@/components/tasks/offline-banner";
import { TaskCard } from "@/components/tasks/task-card";
import { useTheme } from "@/hooks/use-theme";
import { formatLongDay } from "@/features/tasks/local-date";
import { useTaskActions } from "@/features/tasks/use-task-mutations";
import { useUpcomingGroups } from "@/features/tasks/use-tasks";
import { syncNow } from "@/features/tasks/sync-engine";
import type { TaskItem } from "@/features/tasks/task-views";

/**
 * "À venir": radar of the next 14 days (day-grouped, chronological, empty
 * days skipped). Occurrence rows get the 🔁 marker; checking one materializes
 * an instance through the existing offline-first mutations (optimistic write
 * + queue + refetch on reconnect, provided by the sync engine).
 */
export default function UpcomingScreen() {
  const router = useRouter();
  const theme = useTheme();
  const groups = useUpcomingGroups();
  const actions = useTaskActions();

  const open = (item: TaskItem): void => {
    if (item.isOccurrence) {
      router.push({
        pathname: "/(app)/task-editor",
        params: { parent: item.parentTaskId ?? "", date: item.originalDueDate ?? "" },
      });
      return;
    }
    router.push({ pathname: "/(app)/task-editor", params: { id: item.id } });
  };

  const toggle = async (item: TaskItem): Promise<void> => {
    if (item.isOccurrence) {
      await actions.completeOccurrence(item.parentTaskId ?? "", item.originalDueDate ?? "", true);
      return;
    }
    await actions.toggleDone(item.task);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { maxWidth: MaxContentWidth, paddingBottom: BottomTabInset + Spacing.five },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View>
              <ThemedText type="subtitle">À venir</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {formatLongDay(new Date())} · horizon 14 jours
              </ThemedText>
            </View>
            <Pressable onPress={syncNow} hitSlop={8} accessibilityLabel="Synchroniser">
              <Ionicons name="sync" size={20} color={theme.textSecondary} />
            </Pressable>
          </View>

          <OfflineBanner />

          {groups.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              Rien dans les 14 prochains jours.
            </ThemedText>
          )}

          {groups.map((group) => (
            <View key={group.date} style={styles.dayGroup}>
              <View style={styles.dayHeader}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {formatUpcomingDay(group.date, new Date())}
                </ThemedText>
                <View style={[styles.dayLine, { backgroundColor: theme.border }]} />
                <ThemedText type="small" themeColor="textSecondary">
                  {group.items.length}
                </ThemedText>
              </View>
              {group.items.map((item) => (
                <TaskCard
                  key={item.key}
                  item={item}
                  onOpen={open}
                  onToggleDone={toggle}
                  isOverdue={false}
                />
              ))}
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/**
 * Day label of an upcoming group: "Aujourd'hui", "Demain", else
 * "mar. 20 janv." — relative labels for the first two days (the radar's
 * natural reading), absolute short ones after.
 */
function formatUpcomingDay(date: string, now: Date): string {
  const at = new Date(`${date}T12:00:00`); // noon: immune to DST edge shifts
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayDiff = Math.round((at.getTime() - midnight.getTime()) / 86_400_000);
  if (dayDiff === 0) return "Aujourd'hui";
  if (dayDiff === 1) return "Demain";
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(at);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    alignSelf: "center",
    width: "100%",
    padding: Spacing.three,
    gap: Spacing.three,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  empty: {
    borderRadius: Radius.md,
  },
  dayGroup: {
    gap: Spacing.one,
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  dayLine: {
    flex: 1,
    height: 1,
  },
});

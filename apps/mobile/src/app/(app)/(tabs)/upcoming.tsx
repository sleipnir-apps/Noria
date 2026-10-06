import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { BottomTabInset, FontSizes, MaxContentWidth, Spacing } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { OfflineBanner } from "@/components/tasks/offline-banner";
import { UpcomingDaySection } from "@/components/tasks/upcoming-day-section";
import { useTheme } from "@/hooks/use-theme";
import { formatUpcomingDayLabel } from "@/features/tasks/local-date";
import { useTaskActions } from "@/features/tasks/use-task-mutations";
import { useUpcomingGroups } from "@/features/tasks/use-tasks";
import { syncNow } from "@/features/tasks/sync-engine";
import type { TaskItem } from "@/features/tasks/task-views";

/**
 * "À venir": everything scheduled in the next 14 days, grouped by day
 * (empty days skipped). Same offline-first mechanics as "Aujourd'hui":
 * the list is computed from the local dataset, occurrences are marked 🔁,
 * and checking one materializes a DONE instance through the sync queue.
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
                {groups.length === 0
                  ? "Rien de prévu dans les 14 prochains jours."
                  : "Les 14 prochains jours"}
              </ThemedText>
            </View>
            <View style={styles.headerButtons}>
              <Pressable onPress={syncNow} hitSlop={8} accessibilityLabel="Synchroniser">
                <Ionicons name="sync" size={FontSizes.lg} color={theme.textSecondary} />
              </Pressable>
              <Pressable
                onPress={() =>
                  router.push({ pathname: "/(app)/task-editor", params: { date: "" } })
                }
                style={[styles.addButton, { backgroundColor: theme.primary }]}
                accessibilityLabel="Nouvelle tâche"
              >
                <Ionicons name="add" size={FontSizes.lg} color={theme.onPrimary} />
              </Pressable>
            </View>
          </View>

          <OfflineBanner />

          {groups.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              Aucune tâche planifiée pour les 14 prochains jours. Profitez-en.
            </ThemedText>
          ) : (
            groups.map((group) => (
              <UpcomingDaySection
                key={group.date}
                label={formatUpcomingDayLabel(group.date, new Date())}
                items={group.items}
                onOpen={open}
                onToggleDone={toggle}
              />
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
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
  headerButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    marginTop: Spacing.two,
  },
});

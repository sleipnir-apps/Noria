import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { BottomTabInset, MaxContentWidth, Spacing, FontSizes } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { OfflineBanner } from "@/components/tasks/offline-banner";
import { TaskSection } from "@/components/tasks/task-section";
import { useTheme } from "@/hooks/use-theme";
import { relativeDayLabel } from "@/features/tasks/local-date";
import { UPCOMING_DAYS, type TaskItem } from "@/features/tasks/task-views";
import { useTaskActions } from "@/features/tasks/use-task-mutations";
import { useUpcomingGroups } from "@/features/tasks/use-tasks";
import { syncNow } from "@/features/tasks/sync-engine";

/**
 * "À venir": next open dated tasks and occurrences grouped by local calendar
 * day (empty days skipped). Works entirely from the offline-first local
 * dataset; checking an occurrence materializes it like on "Aujourd'hui".
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
                {`Les ${UPCOMING_DAYS} prochains jours`}
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

          {groups.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              {`Aucune échéance dans les ${UPCOMING_DAYS} prochains jours.`}
            </ThemedText>
          )}

          {groups.map((group) => (
            <TaskSection
              key={group.date}
              label={relativeDayLabel(group.date, new Date())}
              count={group.items.length}
              items={group.items}
              onOpen={open}
              onToggleDone={toggle}
            />
          ))}
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

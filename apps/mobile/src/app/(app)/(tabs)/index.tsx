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
import { formatLongDay } from "@/features/tasks/local-date";
import { useTaskActions } from "@/features/tasks/use-task-mutations";
import { useTodaySections } from "@/features/tasks/use-tasks";
import { syncNow } from "@/features/tasks/sync-engine";
import type { TaskItem } from "@/features/tasks/task-views";

/**
 * "Aujourd'hui": open dated tasks of the day, computed occurrences of the
 * day, then late tasks / last missed occurrences. Works entirely from the
 * offline-first local dataset.
 */
export default function TodayScreen() {
  const router = useRouter();
  const theme = useTheme();
  const sections = useTodaySections();
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

  const nothingToday =
    sections.datedToday.length === 0 &&
    sections.occurrencesToday.length === 0 &&
    sections.overdue.length === 0;

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
              <ThemedText type="subtitle">Aujourd'hui</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {formatLongDay(new Date())}
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

          {nothingToday && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              Rien de prévu aujourd'hui. Profitez-en.
            </ThemedText>
          )}

          <TaskSection
            label="En retard"
            labelColor="danger"
            overdue
            count={sections.overdue.length}
            items={sections.overdue}
            onOpen={open}
            onToggleDone={toggle}
          />
          <TaskSection
            label="À faire aujourd'hui"
            count={sections.datedToday.length}
            items={sections.datedToday}
            onOpen={open}
            onToggleDone={toggle}
          />
          <TaskSection
            label="Occurrences du jour"
            count={sections.occurrencesToday.length}
            items={sections.occurrencesToday}
            onOpen={open}
            onToggleDone={toggle}
          />
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

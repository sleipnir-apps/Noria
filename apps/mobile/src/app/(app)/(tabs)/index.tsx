/**
 * "Aujourd'hui" screen — three sections: overdue, dated tasks of the day,
 * occurrences of the day (recurring). Fully offline-first: renders the
 * persisted local cache; mutations are optimistic + queued.
 */
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import type { TaskDto } from "@template/contracts";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { OfflineBanner } from "@/components/offline-banner";
import { Spacing, useTheme } from "@/lib/ui";
import { TaskCard } from "@/features/tasks/task-card";
import { selectToday } from "@/features/tasks/views";
import { useDeleteTask, useLocalTasks, useUpdateTask } from "@/features/tasks/use-tasks";

interface Row {
  key: string;
  task: TaskDto;
  badge?: string;
  badgeColor?: string;
}

/**
 * Virtual occurrence rows embed a synthetic id `<parent>@<instant>` — the
 * real parent id precedes the `@`.
 */
function syntheticParentId(syntheticId: string): string {
  return syntheticId.split("@")[0] ?? syntheticId;
}

interface Section {
  title: string;
  rows: Row[];
}

export default function TodayScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { data: tasks, isLoading } = useLocalTasks();
  const { mutate: updateTask } = useUpdateTask();
  const { mutate: deleteTask } = useDeleteTask();

  const sections = useMemo<Section[]>(() => {
    const selected = selectToday(tasks ?? []);
    const toRow = (task: TaskDto, badge?: string, badgeColor?: string): Row => ({
      key: `${task.due_date ?? ""}:${task.id}`,
      task,
      badge,
      badgeColor,
    });

    const overdueRows = selected.overdue.map((t) => toRow(t, "En retard"));
    const datedRows = selected.dated.map((t) =>
      toRow(t, t.recurrence_rule ? "Récurrente" : undefined)
    );
    const occurrenceRows = selected.occurrences.map((t) => toRow(t, "Récurrente"));

    const result: Section[] = [
      { title: `En retard (${overdueRows.length})`, rows: overdueRows },
      { title: `Prévues aujourd'hui (${datedRows.length})`, rows: datedRows },
      { title: `Occurrences du jour (${occurrenceRows.length})`, rows: occurrenceRows },
    ];
    return result.filter((s) => s.rows.length > 0);
  }, [tasks]);

  function handleToggle(task: TaskDto) {
    const done = task.status === "DONE";
    const isOccurrence = task.is_occurrence === true;
    updateTask({
      // Occurrence rows mutate through the PARENT id + instant so the server
      // materializes an instance; plain tasks use their own id.
      id: task.parent_task_id ?? syntheticParentId(task.id),
      occurrenceDate: isOccurrence ? (task.occurrence_date ?? undefined) : undefined,
      dto: { status: done ? "TODO" : "DONE" },
    });
  }

  function handlePress(task: TaskDto) {
    router.push({
      pathname: "/(app)/task-editor",
      params: {
        id: task.parent_task_id ?? task.id,
        occurrence_date: task.occurrence_date ?? "",
      },
    });
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
        <FlatList
          data={sections}
          keyExtractor={(section) => section.title}
          renderItem={({ item: section }) => (
            <View style={styles.section}>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
                {section.title}
              </ThemedText>
              {section.rows.map((row) => (
                <TaskCard
                  key={row.key}
                  task={row.task}
                  badge={row.badge}
                  badgeColor={row.badgeColor}
                  onPress={() => handlePress(row.task)}
                  onToggleDone={() => handleToggle(row.task)}
                  onDelete={() => deleteTask(row.task.id)}
                />
              ))}
            </View>
          )}
          ListHeaderComponent={
            <View style={styles.header}>
              <ThemedText type="subtitle">Aujourd&apos;hui</ThemedText>
              <OfflineBanner />
            </View>
          }
          ListEmptyComponent={
            isLoading ? (
              <ActivityIndicator color={theme.primary} style={styles.loader} />
            ) : (
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                Rien pour aujourd&apos;hui. Profite ! ✨
              </ThemedText>
            )
          }
          contentContainerStyle={styles.listContent}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Nouvelle tâche"
          onPress={() => router.push("/(app)/task-editor")}
          style={({ pressed }) => [
            styles.fab,
            { backgroundColor: theme.primary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <ThemedText style={styles.fabText}>＋</ThemedText>
        </Pressable>
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
    paddingHorizontal: Spacing.four,
  },
  header: {
    paddingTop: Spacing.three,
    marginBottom: Spacing.two,
    gap: Spacing.two,
  },
  section: {
    marginBottom: Spacing.three,
    gap: Spacing.two,
  },
  sectionTitle: {
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  loader: {
    marginTop: Spacing.four,
  },
  empty: {
    marginTop: Spacing.six,
    textAlign: "center",
  },
  listContent: {
    paddingBottom: 96,
  },
  fab: {
    position: "absolute",
    right: Spacing.four,
    bottom: Spacing.four,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  fabText: {
    color: "#fff",
    fontSize: 28,
    lineHeight: 34,
  },
});

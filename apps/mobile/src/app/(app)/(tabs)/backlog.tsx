/**
 * Backlog screen — tasks without a due date, sorted by priority then
 * created_at. Offline-first: reads the persisted local cache.
 */
import { FlatList, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import type { TaskDto } from "@template/contracts";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { OfflineBanner } from "@/components/offline-banner";
import { Spacing, useTheme } from "@/lib/ui";
import { TaskCard } from "@/features/tasks/task-card";
import { selectBacklog } from "@/features/tasks/views";
import { useDeleteTask, useLocalTasks, useUpdateTask } from "@/features/tasks/use-tasks";

export default function BacklogScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { data: tasks, isLoading } = useLocalTasks();
  const { mutate: updateTask } = useUpdateTask();
  const { mutate: deleteTask } = useDeleteTask();

  const backlog = useMemo(() => selectBacklog(tasks ?? []), [tasks]);

  function handleToggle(task: TaskDto) {
    updateTask({
      id: task.id,
      dto: { status: task.status === "DONE" ? "TODO" : "DONE" },
    });
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
        <FlatList
          data={backlog}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => (
            <TaskCard
              task={item}
              onPress={() =>
                router.push({ pathname: "/(app)/task-editor", params: { id: item.id } })
              }
              onToggleDone={() => handleToggle(item)}
              onDelete={() => deleteTask(item.id)}
            />
          )}
          ListHeaderComponent={
            <>
              <ThemedText type="subtitle" style={styles.title}>
                Backlog
              </ThemedText>
              <OfflineBanner />
            </>
          }
          ListFooterComponent={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Nouvelle tâche (backlog)"
              onPress={() => router.push("/(app)/task-editor")}
              style={({ pressed }) => [
                styles.addButton,
                { backgroundColor: theme.primary, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <ThemedText style={styles.addButtonText}>＋ Nouvelle tâche</ThemedText>
            </Pressable>
          }
          refreshing={isLoading === true}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              Aucune tâche sans date. Le Backlog attend ses idées !
            </ThemedText>
          }
        />
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
  title: {
    marginBottom: Spacing.three,
  },
  addButton: {
    alignItems: "center",
    borderRadius: 999,
    marginVertical: Spacing.four,
    paddingVertical: Spacing.three,
  },
  addButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  listContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  empty: {
    marginTop: Spacing.six,
    textAlign: "center",
  },
});

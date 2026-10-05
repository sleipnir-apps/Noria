import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMemo } from "react";

import { ThemedText } from "@/components/themed-text";
import { TaskRow } from "@/components/tasks/task-row";
import { SyncStatusBanner } from "@/components/tasks/sync-status-banner";
import { FontSizes, Spacing } from "@/constants/theme";
import { useTaskSyncLoop, useTasks, useUpdateTask } from "@/features/tasks/use-tasks";
import type { Task } from "@template/contracts";

/** Backlog: tasks without a due date, sorted by priority then creation date. */
export default function BacklogScreen() {
  const router = useRouter();
  useTaskSyncLoop();
  const { data, isLoading, isRefetching } = useTasks({ backlog: "1" });
  const updateTask = useUpdateTask();

  const PRIORITY_ORDER: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };

  const items = useMemo(() => {
    const list = (data?.data ?? []) as Task[];
    return [...list]
      .filter((t) => t.status !== "ARCHIVED")
      .sort((a, b) => {
        const p = (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
        if (p !== 0) return p;
        return a.created_at.localeCompare(b.created_at);
      });
  }, [data]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <ThemedText type="title">Backlog</ThemedText>
        <Pressable onPress={() => router.push("/task-editor")}>
          <ThemedText style={styles.add}>+ Ajouter</ThemedText>
        </Pressable>
      </View>
      <SyncStatusBanner />
      <FlatList
        data={items}
        keyExtractor={(t) => t.id}
        refreshing={isLoading || isRefetching}
        onRefresh={() => void 0}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TaskRow
            title={item.title}
            dueDate={item.due_date}
            hasTime={item.has_time}
            priority={item.priority}
            status={item.status}
            onToggleDone={() =>
              updateTask.mutate({ id: item.id, status: item.status === "DONE" ? "TODO" : "DONE" })
            }
            onPress={() => router.push(`/task-editor?backlog=${item.id}`)}
          />
        )}
        ListEmptyComponent={
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            Aucune tâche sans date. Crée-en une depuis l&apos;éditeur.
          </ThemedText>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  add: {
    color: "#208AEF",
    fontSize: FontSizes.md,
    fontWeight: "600",
  },
  list: {
    padding: Spacing.three,
    paddingBottom: 40,
  },
  empty: {
    fontSize: 13,
    textAlign: "center",
    marginTop: Spacing.four,
  },
});

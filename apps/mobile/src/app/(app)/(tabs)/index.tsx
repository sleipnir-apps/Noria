import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMemo } from "react";

import { ThemedText } from "@/components/themed-text";
import { TaskRow } from "@/components/tasks/task-row";
import { SyncStatusBanner } from "@/components/tasks/sync-status-banner";
import { Spacing } from "@/constants/theme";
import {
  todayRange,
  useCompleteOccurrence,
  useDeleteTask,
  useOverdueTasks,
  useTaskRange,
  useTaskSyncLoop,
  useUpdateTask,
} from "@/features/tasks/use-tasks";
import type { Task } from "@template/contracts";

type RangeTask = Task & { due_date: string | null };

/** Today's screen: dated-today, today's occurrences, then overdue. */
export default function TodayScreen() {
  const range = useMemo(() => todayRange(), []);
  useTaskSyncLoop();

  const rangeQuery = useTaskRange(range.start, range.end);
  const overdueQuery = useOverdueTasks();
  const updateTask = useUpdateTask();
  const completeOccurrence = useCompleteOccurrence();
  const deleteTask = useDeleteTask();

  const tasks = (rangeQuery.data?.tasks ?? []) as RangeTask[];
  const overdue = (overdueQuery.data?.tasks ?? []) as RangeTask[];

  const isDone = (t: RangeTask) => t.status === "DONE" || t.status === "ARCHIVED";

  const todayDated = tasks.filter((t) => !t.parent_task_id && !isDone(t));
  const todayOccurrences = tasks.filter((t) => t.parent_task_id && !isDone(t));
  const overdueOpen = overdue.filter((t) => !isDone(t));

  function handleToggle(t: RangeTask) {
    if (t.parent_task_id && t.original_due_date) {
      // Virtual occurrence → materialize an instance as DONE.
      completeOccurrence.mutate({
        parentId: t.parent_task_id,
        originalDueDate: t.original_due_date,
      });
      return;
    }
    const next = isDone(t) ? "TODO" : "DONE";
    updateTask.mutate({ id: t.id, status: next });
  }

  function handleDelete(t: RangeTask) {
    void deleteTask.mutateAsync(t.id);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <SyncStatusBanner />

        <ThemedText type="title" style={styles.title}>
          Aujourd&apos;hui
        </ThemedText>

        <Section title="Datées du jour" count={todayDated.length}>
          {todayDated.map((t) => (
            <TaskRow
              key={t.id}
              title={t.title}
              dueDate={t.due_date}
              hasTime={t.has_time}
              priority={t.priority}
              status={t.status}
              onToggleDone={() => handleToggle(t)}
              onPress={() => handleToggle(t)}
            />
          ))}
        </Section>

        <Section title="Occurrences du jour" count={todayOccurrences.length}>
          {todayOccurrences.map((t) => (
            <TaskRow
              key={t.id}
              title={t.title}
              dueDate={t.due_date}
              hasTime={t.has_time}
              priority={t.priority}
              status={t.status}
              virtual
              onToggleDone={() => handleToggle(t)}
              onPress={() => handleDelete(t)}
            />
          ))}
        </Section>

        <Section title="Retards" count={overdueOpen.length}>
          {overdueOpen.map((t) => (
            <TaskRow
              key={t.id}
              title={t.title}
              dueDate={t.due_date}
              hasTime={t.has_time}
              priority={t.priority}
              status={t.status}
              overdue
              onToggleDone={() => handleToggle(t)}
              onPress={() => handleToggle(t)}
            />
          ))}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <ThemedText type="subtitle">
        {title} <ThemedText themeColor="textSecondary">({count})</ThemedText>
      </ThemedText>
      {count === 0 ? (
        <ThemedText themeColor="textSecondary" style={styles.empty}>
          Rien ici.
        </ThemedText>
      ) : (
        children
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    paddingBottom: 40,
  },
  title: {
    marginBottom: Spacing.three,
  },
  section: {
    marginBottom: Spacing.four,
    gap: Spacing.two,
  },
  empty: {
    fontSize: 13,
  },
});

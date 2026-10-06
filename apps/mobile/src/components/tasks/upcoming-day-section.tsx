import { StyleSheet, View } from "react-native";
import { Spacing, Radius } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { TaskCard, type TaskCardProps } from "@/components/tasks/task-card";
import type { TaskItem } from "@/features/tasks/task-views";

/**
 * One day of the "À venir" list: a header label ("Aujourd'hui", "Demain",
 * "jeudi 15 janvier") + the day's task rows. Occurrences are marked 🔁.
 */
export function UpcomingDaySection({
  label,
  items,
  onOpen,
  onToggleDone,
}: {
  label: string;
  items: TaskItem[];
  onOpen: TaskCardProps["onOpen"];
  onToggleDone?: TaskCardProps["onToggleDone"];
}) {
  if (items.length === 0) return null;

  return (
    <ThemedView style={styles.section}>
      <View style={styles.header}>
        <ThemedText type="subtitle" style={styles.title}>
          {label}
        </ThemedText>
        <ThemedText type="subtitle" themeColor="textSecondary">
          {items.length}
        </ThemedText>
      </View>
      {items.map((item) => (
        <TaskCard key={item.key} item={item} onOpen={onOpen} onToggleDone={onToggleDone} />
      ))}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.one,
  },
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: Spacing.two,
    marginBottom: Spacing.one,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    borderRadius: Radius.sm,
  },
});

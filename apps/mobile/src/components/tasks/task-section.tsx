import { StyleSheet, View } from "react-native";
import { Radius, Spacing, type ThemeColor } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { TaskCard, type TaskCardProps } from "@/components/tasks/task-card";
import type { TaskItem } from "@/features/tasks/task-views";

/** Section title + rows, used by the (tabs) screens to lay out the views. */
export function TaskSection({
  label,
  count,
  labelColor = "text",
  overdue = false,
  items,
  emptyLabel,
  onOpen,
  onToggleDone,
}: {
  label: string;
  labelColor?: ThemeColor;
  overdue?: boolean;
  count?: number;
  items: TaskItem[];
  emptyLabel?: string;
  onOpen: TaskCardProps["onOpen"];
  onToggleDone?: TaskCardProps["onToggleDone"];
}) {
  const isEmpty = items.length === 0;
  const showEmpty = isEmpty && emptyLabel !== undefined;

  if (!showEmpty && isEmpty) return null;

  return (
    <ThemedView style={styles.section}>
      <View style={styles.header}>
        <ThemedText type="subtitle" themeColor={labelColor} style={styles.title}>
          {label}
        </ThemedText>
        {count !== undefined && (
          <ThemedText
            type="subtitle"
            themeColor={labelColor === "text" ? "textSecondary" : labelColor}
          >
            {count}
          </ThemedText>
        )}
      </View>
      {showEmpty ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
          {emptyLabel}
        </ThemedText>
      ) : (
        items.map((item) => (
          <TaskCard
            key={item.key}
            item={item}
            onOpen={onOpen}
            onToggleDone={onToggleDone}
            isOverdue={overdue}
          />
        ))
      )}
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
    fontSize: 20,
    lineHeight: 26,
  },
  empty: {
    borderRadius: Radius.md,
  },
});

import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";
import { FontSizes, Radius, Spacing, type ThemeColor } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useTheme } from "@/hooks/use-theme";
import { formatChipDate, formatChipTime } from "@/features/tasks/local-date";
import { recurrenceSummary, type TaskItem } from "@/features/tasks/task-views";

/** Priority → theme color of the check circle. */
const PRIORITY_COLOR: Record<TaskItem["task"]["priority"], ThemeColor> = {
  P1: "danger",
  P2: "secondary",
  P3: "primary",
  P4: "textSecondary",
};

export interface TaskCardProps {
  item: TaskItem;
  /** Open in the editor (tap on the card). */
  onOpen?: (item: TaskItem) => void;
  /** Toggle complete (tap on the circle). */
  onToggleDone?: (item: TaskItem) => void;
  /** Paint the date chip red (overdue section). */
  isOverdue?: boolean;
}

/**
 * One task row: completion circle + title + small meta chips. Occurrences of
 * recurring tasks and materialized instances get a "récurrent" chip so the
 * user knows the edit is scoped to that day only.
 */
export function TaskCard({ item, onOpen, onToggleDone, isOverdue = false }: TaskCardProps) {
  const theme = useTheme();
  const { task } = item;
  const done = task.status === "DONE";
  const recurring = task.parentTaskId !== undefined || item.isOccurrence;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.row}>
        {onToggleDone !== undefined && (
          <Pressable
            onPress={() => onToggleDone(item)}
            accessibilityLabel={done ? "Marquer comme à faire" : "Marquer comme terminée"}
            style={[
              styles.check,
              { borderColor: theme[PRIORITY_COLOR[task.priority]] },
              done && { backgroundColor: theme[PRIORITY_COLOR[task.priority]] },
            ]}
            hitSlop={8}
          >
            {done && <Ionicons name="checkmark" size={16} color={theme.onPrimary} />}
          </Pressable>
        )}

        <Pressable onPress={() => onOpen?.(item)} style={styles.body}>
          <ThemedText style={[styles.title, done && styles.done]} numberOfLines={2}>
            {task.title}
          </ThemedText>
          <View style={styles.meta}>
            <View
              style={[
                styles.priorityBadge,
                { backgroundColor: theme[PRIORITY_COLOR[task.priority]] },
              ]}
            >
              <ThemedText type="small" themeColor="onPrimary" style={styles.badgeText}>
                {task.priority}
              </ThemedText>
            </View>
            {task.dueDate !== undefined && (
              <View style={styles.chip}>
                <Ionicons
                  name="time-outline"
                  size={12}
                  color={isOverdue || isLate(item) ? theme.danger : theme.textSecondary}
                />
                <ThemedText
                  type="small"
                  themeColor={isOverdue || isLate(item) ? "danger" : "textSecondary"}
                  style={styles.chipText}
                >
                  {formatChipDate(task.dueDate)}
                  {task.hasTime ? ` · ${formatChipTime(task.dueDate)}` : ""}
                </ThemedText>
              </View>
            )}
            {recurring && (
              <View style={styles.chip}>
                <Ionicons name="repeat" size={12} color={theme.primary} />
                <ThemedText type="small" themeColor="textSecondary" style={styles.chipText}>
                  🔁{" "}
                  {item.isOccurrence || task.parentTaskId === undefined
                    ? "Récurrent"
                    : "Occurrence"}
                </ThemedText>
              </View>
            )}
            {!item.isOccurrence && task.recurrenceRule !== undefined && (
              <ThemedText
                type="small"
                themeColor="textSecondary"
                style={styles.chipText}
                numberOfLines={1}
              >
                {recurrenceSummary(task.recurrenceRule)}
              </ThemedText>
            )}
            {task.subtasks.length > 0 && (
              <View style={styles.chip}>
                <Ionicons name="checkmark-done-outline" size={12} color={theme.textSecondary} />
                <ThemedText type="small" themeColor="textSecondary" style={styles.chipText}>
                  {task.subtasks.filter((subtask) => subtask.isCompleted).length}/
                  {task.subtasks.length}
                </ThemedText>
              </View>
            )}
            {task.tags.map((tag) => (
              <View
                key={tag}
                style={[styles.chip, styles.tagChip, { backgroundColor: theme.backgroundSelected }]}
              >
                <ThemedText
                  type="small"
                  themeColor="textSecondary"
                  style={styles.chipText}
                  numberOfLines={1}
                >
                  {tag}
                </ThemedText>
              </View>
            ))}
          </View>
        </Pressable>

        {onOpen !== undefined && (
          <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
        )}
      </View>
    </ThemedView>
  );
}

/** True when the display date is before now (red chip even outside "retard"). */
function isLate(item: TaskItem): boolean {
  return item.task.dueDate !== undefined && new Date(item.task.dueDate).getTime() < Date.now();
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  body: {
    flex: 1,
    gap: Spacing.half,
  },
  title: {
    fontWeight: 600,
  },
  done: {
    textDecorationLine: "line-through",
    opacity: 0.6,
  },
  meta: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: Spacing.two,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  priorityBadge: {
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  badgeText: {
    fontSize: FontSizes.xs,
    fontWeight: "700",
  },
  tagChip: {
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  chipText: {
    fontSize: FontSizes.xs,
  },
});

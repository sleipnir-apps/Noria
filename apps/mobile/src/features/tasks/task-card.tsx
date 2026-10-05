/**
 * Task card — single lightweight component shared by all task views.
 * Supports the virtual occurrence rows (is_occurrence + synthetic id).
 */
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { TaskDto } from "@template/contracts";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { FontSizes, Radius, Spacing, useTheme } from "@/lib/ui";

const PRIORITY_COLORS: Record<string, string> = {
  P1: "#d7382f",
  P2: "#e07b1f",
  P3: "#208AEF",
  P4: "#7d8790",
};

const PRIORITY_LABELS: Record<string, string> = {
  P1: "P1 · Urgente",
  P2: "P2 · Haute",
  P3: "P3 · Normale",
  P4: "P4 · Basse",
};

export interface TaskCardProps {
  task: TaskDto;
  onPress?: () => void;
  onToggleDone?: () => void;
  onDelete?: () => void;
  /** Short badge shown next to the title (e.g. "En retard", "Récurrente"). */
  badge?: string;
  badgeColor?: string;
}

export function TaskCard({
  task,
  onPress,
  onToggleDone,
  onDelete,
  badge,
  badgeColor,
}: TaskCardProps) {
  const theme = useTheme();
  const priorityColor = PRIORITY_COLORS[task.priority ?? "P3"] ?? PRIORITY_COLORS.P3;
  const done = task.status === "DONE";

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={done ? `Marquer ${task.title} à faire` : `Terminer ${task.title}`}
        onPress={onToggleDone}
        hitSlop={8}
        style={styles.checkHolder}
      >
        <View
          style={[
            styles.checkbox,
            { borderColor: done ? priorityColor : theme.border },
            done && { backgroundColor: priorityColor, borderColor: priorityColor },
          ]}
        >
          {done ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Ouvrir ${task.title}`}
        onPress={onPress}
        style={({ pressed }) => [styles.main, { opacity: pressed ? 0.6 : 1 }]}
      >
        <ThemedText
          type="smallBold"
          style={[styles.title, done && styles.titleDone]}
          numberOfLines={1}
        >
          {task.title}
        </ThemedText>

        <View style={styles.metaRow}>
          <View style={[styles.priorityDot, { backgroundColor: priorityColor }]} />
          <ThemedText type="small" themeColor="textSecondary">
            {PRIORITY_LABELS[task.priority ?? "P3"] ?? task.priority}
          </ThemedText>
          {task.due_date && task.has_time ? (
            <ThemedText type="small" themeColor="textSecondary">
              · {formatTime(task.due_date)}
            </ThemedText>
          ) : null}
          {badge ? (
            <View style={[styles.badge, { backgroundColor: badgeColor ?? theme.danger }]}>
              <ThemedText type="small" style={styles.badgeText}>
                {badge}
              </ThemedText>
            </View>
          ) : null}
        </View>

        {(task.subtasks?.length ?? 0) > 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            {task.subtasks?.filter((s) => s.is_completed).length}/{task.subtasks?.length}{" "}
            sous-tâches
          </ThemedText>
        ) : null}
      </Pressable>

      {onDelete ? (
        <Pressable
          accessibilityRole="button"
          onPress={onDelete}
          hitSlop={8}
          style={styles.deleteHolder}
        >
          <Ionicons name="trash-outline" size={18} color={theme.danger} />
        </Pressable>
      ) : null}
    </ThemedView>
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
  },
  checkHolder: {
    padding: Spacing.one,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  main: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: FontSizes.md,
  },
  titleDone: {
    textDecorationLine: "line-through",
    color: "#7d8790",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  badge: {
    marginLeft: Spacing.half,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
  },
  badgeText: {
    color: "#fff",
    fontSize: FontSizes.xs,
    fontWeight: "600",
  },
  deleteHolder: {
    padding: Spacing.two,
  },
});

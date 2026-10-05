import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemedText } from "@/components/themed-text";
import { FontSizes, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

const PRIORITY_COLORS: Record<string, string> = {
  P1: "#e5484d",
  P2: "#f5a623",
  P3: "#208AEF",
  P4: "#8f9399",
};

interface TaskRowProps {
  title: string;
  dueDate?: string | null;
  hasTime?: boolean;
  priority?: string;
  status?: string;
  progress?: string;
  onToggleDone?: () => void;
  onPress?: () => void;
  overdue?: boolean;
  virtual?: boolean;
}

function formatDue(dueDate: string | null | undefined, hasTime: boolean): string {
  if (!dueDate) return "Sans date";
  const d = new Date(dueDate);
  const dateStr = d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  if (!hasTime) return dateStr;
  return `${dateStr} · ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function TaskRow({
  title,
  dueDate,
  hasTime = false,
  priority = "P3",
  status = "TODO",
  progress,
  onToggleDone,
  onPress,
  overdue = false,
  virtual = false,
}: TaskRowProps) {
  const theme = useTheme();
  const isDone = status === "DONE";

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.row,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        overdue && { borderColor: PRIORITY_COLORS.P1 },
      ]}
    >
      <Pressable
        onPress={onToggleDone}
        hitSlop={8}
        style={[
          styles.checkbox,
          { borderColor: theme.border },
          isDone && { backgroundColor: theme.primary, borderColor: theme.primary },
        ]}
      >
        {isDone ? <Ionicons name="checkmark" size={14} color={theme.onPrimary} /> : null}
      </Pressable>

      <View style={styles.content}>
        <ThemedText style={[styles.title, isDone && styles.done]} numberOfLines={2}>
          {title}
        </ThemedText>
        <View style={styles.metaRow}>
          <View
            style={[
              styles.priorityDot,
              { backgroundColor: PRIORITY_COLORS[priority] ?? PRIORITY_COLORS.P3 },
            ]}
          />
          <ThemedText themeColor="textSecondary" style={styles.meta}>
            {formatDue(dueDate, hasTime)}
            {virtual ? " · occurrence" : ""}
            {progress ? ` · ${progress}` : ""}
          </ThemedText>
        </View>
      </View>

      {status === "IN_PROGRESS" ? (
        <Ionicons name="play" size={14} color={theme.primary} />
      ) : overdue ? (
        <Ionicons name="warning" size={14} color={PRIORITY_COLORS.P1} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginBottom: Spacing.two,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: FontSizes.md,
  },
  done: {
    textDecorationLine: "line-through",
    opacity: 0.55,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  meta: {
    fontSize: FontSizes.xs,
  },
});

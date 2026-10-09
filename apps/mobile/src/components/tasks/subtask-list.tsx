import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, TextInput, View, Keyboard } from "react-native";
import { Radius, Spacing } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";
import { blankSubtask } from "@/features/tasks/task-form";
import type { TaskSubtask } from "@template/contracts";

const MAX_SUBTASKS = 50;

/**
 * Subtask editor + viewer: rows with a checkbox and a delete button, and an
 * add row. Also used in read-only mode on the editor of occurrences created
 * from the parent (subtasks are inherited and stay editable).
 */
export function SubtaskList({
  subtasks,
  onChange,
}: {
  subtasks: TaskSubtask[];
  onChange: (subtasks: TaskSubtask[]) => void;
}) {
  const theme = useTheme();
  const [draft, setDraft] = useState("");

  const add = (): void => {
    const title = draft.trim();
    if (title === "" || subtasks.length >= MAX_SUBTASKS) return;
    onChange([...subtasks, blankSubtask(title)]);
    setDraft("");
    Keyboard.dismiss();
  };

  const toggle = (subtaskId: string): void => {
    onChange(
      subtasks.map((subtask) =>
        subtask.id === subtaskId ? { ...subtask, isCompleted: !subtask.isCompleted } : subtask
      )
    );
  };

  return (
    <View style={styles.container}>
      {subtasks.map((subtask) => (
        <View key={subtask.id} style={styles.row}>
          <Pressable
            onPress={() => toggle(subtask.id)}
            hitSlop={6}
            accessibilityLabel={
              subtask.isCompleted ? "Retirer la sous-tâche terminée" : "Terminer la sous-tâche"
            }
          >
            <Ionicons
              name={subtask.isCompleted ? "checkbox" : "square-outline"}
              size={20}
              color={subtask.isCompleted ? theme.primary : theme.textSecondary}
            />
          </Pressable>
          <ThemedText
            type="small"
            style={[styles.subtitle, subtask.isCompleted && styles.done]}
            numberOfLines={1}
          >
            {subtask.title}
          </ThemedText>
          <Pressable
            onPress={() => onChange(subtasks.filter((entry) => entry.id !== subtask.id))}
            hitSlop={6}
          >
            <Ionicons name="close" size={16} color={theme.textSecondary} />
          </Pressable>
        </View>
      ))}
      <View style={styles.adder}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={add}
          blurOnSubmit={false}
          placeholder="Ajouter une sous-tâche"
          placeholderTextColor={theme.textSecondary}
          maxLength={100}
          style={[
            styles.input,
            { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
          ]}
          accessibilityLabel="Nouvelle sous-tâche"
        />
        <Pressable onPress={add} hitSlop={4}>
          <Ionicons name="add" size={20} color={theme.primary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  subtitle: {
    flex: 1,
  },
  done: {
    textDecorationLine: "line-through",
    opacity: 0.6,
  },
  adder: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    fontSize: 14,
  },
});

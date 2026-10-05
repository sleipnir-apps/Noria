import { Pressable, StyleSheet, Switch, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import type { Subtask, TaskPriority } from "@template/contracts";

import { ThemedText } from "@/components/themed-text";
import { Spacing, Radius } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { newTaskId, useCreateTask, useUpdateTask } from "@/features/tasks/use-tasks";
import { useTask } from "@/features/tasks/use-tasks";

const PRIORITIES: TaskPriority[] = ["P1", "P2", "P3", "P4"];
const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"]; // Monday-first labels

/**
 * Create-or-edit screen. Params: backlog=<taskId> edits an existing backlog
 * task; no param creates a new one. Minimal recurrence: weekday picker.
 */
export default function TaskEditorScreen() {
  const router = useRouter();
  const { backlog: editId, due: dueParam } = useLocalSearchParams<{
    backlog?: string;
    due?: string;
  }>();
  const theme = useTheme();

  const existing = useTask(editId ?? "");
  const editing = editId ? existing.data : undefined;

  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("P3");
  const [dueDate, setDueDate] = useState("");
  const [hasTime, setHasTime] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();

  useEffect(() => {
    if (editing) {
      setTitle(editing.title);
      setPriority(editing.priority);
      setDueDate(editing.due_date ?? "");
      setHasTime(editing.has_time);
      setTags(editing.tags);
      setSubtasks(editing.subtasks);
      setWeekdays(editing.recurrence_rule?.by_weekday ?? []);
    } else if (dueParam) {
      setDueDate(dueParam);
      setHasTime(true);
    }
  }, [editing, dueParam]);

  function toggleWeekday(i: number) {
    setWeekdays((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].sort()));
  }

  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  }

  function addSubtask() {
    setSubtasks((prev) => [
      ...prev,
      { id: newTaskId(), title: `Sous-tâche ${prev.length + 1}`, is_completed: false },
    ]);
  }

  function toggleSubtask(id: string) {
    setSubtasks((prev) =>
      prev.map((s) => (s.id === id ? { ...s, is_completed: !s.is_completed } : s))
    );
  }

  async function save() {
    const trimmed = title.trim();
    if (!trimmed) return;
    const recurrence_rule =
      weekdays.length > 0
        ? { frequency: "WEEKLY" as const, interval: 1, by_weekday: weekdays }
        : null;

    if (editing) {
      await updateTask.mutateAsync({
        id: editing.id,
        title: trimmed,
        priority,
        due_date: dueDate || null,
        has_time: hasTime && !!dueDate,
        tags,
        subtasks,
        recurrence_rule,
      });
    } else {
      await createTask.mutateAsync({
        title: trimmed,
        priority: priority satisfies TaskPriority,
        due_date: dueDate || null,
        has_time: hasTime && !!dueDate,
        tags,
        subtasks,
        recurrence_rule,
      });
    }
    router.back();
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ThemedText type="title" style={styles.title}>
        {editing ? "Modifier la tâche" : "Nouvelle tâche"}
      </ThemedText>

      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: theme.backgroundElement,
            color: theme.text,
            borderColor: theme.border,
          },
        ]}
        placeholder="Titre de la tâche"
        placeholderTextColor={theme.textSecondary}
        value={title}
        onChangeText={setTitle}
      />

      <ThemedText style={styles.label}>Priorité</ThemedText>
      <View style={styles.row}>
        {PRIORITIES.map((p) => (
          <Pressable
            key={p}
            onPress={() => setPriority(p)}
            style={[
              styles.chip,
              { borderColor: theme.border },
              priority === p && { backgroundColor: theme.primary, borderColor: theme.primary },
            ]}
          >
            <ThemedText style={priority === p ? { color: theme.onPrimary } : undefined}>
              {p}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      <ThemedText style={styles.label}>Date (ISO ou vide)</ThemedText>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: theme.backgroundElement,
            color: theme.text,
            borderColor: theme.border,
          },
        ]}
        placeholder="2026-12-07T09:00:00.000Z"
        placeholderTextColor={theme.textSecondary}
        value={dueDate}
        onChangeText={setDueDate}
        autoCapitalize="none"
      />

      <View style={styles.switchRow}>
        <ThemedText>Heure spécifique</ThemedText>
        <Switch value={hasTime} onValueChange={setHasTime} />
      </View>

      <ThemedText style={styles.label}>Tags</ThemedText>
      <View style={styles.row}>
        {tags.map((t) => (
          <Pressable key={t} onPress={() => setTags(tags.filter((x) => x !== t))}>
            <ThemedText themeColor="textSecondary" style={styles.tag}>
              {t} ✕
            </ThemedText>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: theme.backgroundElement,
            color: theme.text,
            borderColor: theme.border,
          },
        ]}
        placeholder="Ajouter un tag puis valider"
        placeholderTextColor={theme.textSecondary}
        value={tagInput}
        onChangeText={setTagInput}
        onSubmitEditing={addTag}
      />

      <ThemedText style={styles.label}>Sous-tâches</ThemedText>
      {subtasks.map((s) => (
        <Pressable key={s.id} onPress={() => toggleSubtask(s.id)} style={styles.switchRow}>
          <ThemedText
            style={
              s.is_completed ? { textDecorationLine: "line-through", opacity: 0.6 } : undefined
            }
          >
            {s.is_completed ? "☑" : "☐"} {s.title}
          </ThemedText>
        </Pressable>
      ))}
      <Pressable onPress={addSubtask}>
        <ThemedText style={styles.addSub}>+ Sous-tâche</ThemedText>
      </Pressable>

      <ThemedText style={styles.label}>Répéter chaque semaine le…</ThemedText>
      <View style={styles.row}>
        {WEEKDAYS.map((label, i) => (
          <Pressable
            key={i}
            onPress={() => toggleWeekday(i)}
            style={[
              styles.chip,
              styles.weekdayChip,
              { borderColor: theme.border },
              weekdays.includes(i) && {
                backgroundColor: theme.primary,
                borderColor: theme.primary,
              },
            ]}
          >
            <ThemedText style={weekdays.includes(i) ? { color: theme.onPrimary } : undefined}>
              {label}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={[styles.save, { backgroundColor: theme.primary }]}
        onPress={() => void save()}
      >
        <ThemedText style={{ color: theme.onPrimary, fontWeight: "600" }}>
          {editing ? "Enregistrer" : "Créer la tâche"}
        </ThemedText>
      </Pressable>
      <Pressable style={styles.cancel} onPress={() => router.back()}>
        <ThemedText themeColor="textSecondary">Annuler</ThemedText>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    padding: Spacing.three,
  },
  title: {
    marginBottom: Spacing.three,
  },
  label: {
    marginTop: Spacing.three,
    marginBottom: 6,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  weekdayChip: {
    minWidth: 40,
    alignItems: "center",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 6,
  },
  tag: {
    fontSize: 13,
  },
  addSub: {
    color: "#208AEF",
    marginTop: 4,
  },
  save: {
    marginTop: Spacing.four,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: Radius.md,
  },
  cancel: {
    marginTop: Spacing.two,
    alignItems: "center",
    paddingVertical: 8,
  },
});

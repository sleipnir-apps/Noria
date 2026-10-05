/**
 * Task editor-creator screen (stack route).
 * - No `id` param: creation mode.
 * - `id` param: edit mode (`occurrence_date` present → occurrence mutation,
 *   materialized as an instance server-side; the parent is never modified).
 * Fields: title, priority, date ± time (has_time), tags, subtasks, and the
 * simple weekday recurrence.
 */
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { TaskDto, TaskPriority, TaskWeekday } from "@template/contracts";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { FontSizes, Radius, Spacing, useTheme } from "@/lib/ui";
import { useCreateTask, useLocalTasks, useUpdateTask } from "@/features/tasks/use-tasks";

const PRIORITIES: Array<{ value: TaskPriority; label: string; color: string }> = [
  { value: "P1", label: "P1", color: "#d7382f" },
  { value: "P2", label: "P2", color: "#e07b1f" },
  { value: "P3", label: "P3", color: "#208AEF" },
  { value: "P4", label: "P4", color: "#7d8790" },
];

const WEEKDAYS: Array<{ value: TaskWeekday; label: string }> = [
  { value: "MO", label: "L" },
  { value: "TU", label: "M" },
  { value: "WE", label: "M" },
  { value: "TH", label: "J" },
  { value: "FR", label: "V" },
  { value: "SA", label: "S" },
  { value: "SU", label: "D" },
];

export default function TaskEditorScreen() {
  const router = useRouter();
  const theme = useTheme();
  const params = useLocalSearchParams<{
    id?: string;
    occurrence_date?: string;
    focus_date?: string;
  }>();
  const editingId = params.id;
  const occurrenceDate = params.occurrence_date || undefined;

  const { data: tasks } = useLocalTasks();
  const existing = useMemo<TaskDto | undefined>(() => {
    if (!editingId || !tasks) return undefined;
    return tasks.find((t) => t.id === editingId);
  }, [editingId, tasks]);

  const { mutate: createTask, isPending: isCreating } = useCreateTask();
  const { mutate: updateTask, isPending: isSaving } = useUpdateTask();

  // Local form state (simple, controlled — no RHF for this free-form editor).
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("P3");
  const [hasDate, setHasDate] = useState(false);
  const [dateText, setDateText] = useState("");
  const [hasTime, setHasTime] = useState(false);
  const [timeText, setTimeText] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [subtasks, setSubtasks] = useState<
    Array<{ id: string; title: string; is_completed: boolean }>
  >([]);
  const [newSubtask, setNewSubtask] = useState("");
  const [recurrenceDays, setRecurrenceDays] = useState<TaskWeekday[]>([]);
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);

  useEffect(() => {
    if (!existing) return;
    setTitle(existing.title);
    setDescription(existing.description ?? "");
    setPriority(existing.priority ?? "P3");
    const due = existing.due_date ? new Date(existing.due_date) : null;
    setHasDate(!!due);
    if (due) {
      setDateText(toDateInputValue(due));
      setHasTime(existing.has_time === true);
      if (existing.has_time) setTimeText(toTimeInputValue(due));
    }
    setTagsText((existing.tags ?? []).join(", "));
    setSubtasks(existing.subtasks ?? []);
    const rule = existing.recurrence_rule;
    if (rule) {
      setRecurrenceDays(rule.by_weekday ?? []);
      setRecurrenceInterval(rule.interval);
    }
  }, [existing]);

  function buildDueDateIso(): string | null {
    if (!hasDate || !dateText) return null;
    // dateText = YYYY-MM-DD; timeText = HH:mm (defaults 00:00 → has_time false)
    const [year, month, day] = dateText.split("-").map((p) => Number(p));
    const [hours, minutes] =
      hasTime && timeText ? timeText.split(":").map((p) => Number(p)) : [0, 0];
    if (!year || !month || !day) return null;
    const date = new Date(year, month - 1, day, hours || 0, minutes || 0);
    return date.toISOString();
  }

  function buildRecurrenceRule(): TaskDto["recurrence_rule"] {
    if (recurrenceDays.length === 0) return null;
    return {
      frequency: "WEEKLY",
      interval: recurrenceInterval,
      by_weekday: [...recurrenceDays].sort(),
      end_date: null,
    };
  }

  function handleSave() {
    const trimmed = title.trim();
    if (!trimmed) return;

    const dueDate = buildDueDateIso();
    const rule = buildRecurrenceRule();
    const tags = tagsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    if (editingId) {
      updateTask({
        id: editingId,
        occurrenceDate,
        dto: {
          title: trimmed,
          description: description || null,
          priority,
          due_date: dueDate,
          has_time: hasTime && !!dueDate,
          tags,
          subtasks,
          recurrence_rule: rule,
        },
      });
      router.back();
      return;
    }

    createTask({
      title: trimmed,
      description: description || undefined,
      priority,
      due_date: dueDate ?? undefined,
      has_time: hasTime && !!dueDate,
      tags,
      subtasks,
      recurrence_rule: rule ?? undefined,
    });
    router.back();
  }

  function addSubtask() {
    const trimmed = newSubtask.trim();
    if (!trimmed) return;
    setSubtasks((prev) => [
      ...prev,
      {
        id: `st-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
        title: trimmed,
        is_completed: false,
      },
    ]);
    setNewSubtask("");
  }

  const isSavingSomething = isCreating || isSaving;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="subtitle" style={styles.heading}>
            {editingId
              ? occurrenceDate
                ? "Modifier l'occurrence"
                : "Modifier la tâche"
              : "Nouvelle tâche"}
          </ThemedText>

          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Titre de la tâche"
            placeholderTextColor={theme.textSecondary}
            style={[
              styles.titleInput,
              { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
            ]}
          />

          {/* Priority */}
          <FieldGroup label="Priorité">
            <View style={styles.row}>
              {PRIORITIES.map((p) => (
                <Pressable
                  key={p.value}
                  accessibilityRole="button"
                  accessibilityLabel={`Priorité ${p.value}`}
                  onPress={() => setPriority(p.value)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: priority === p.value ? p.color : theme.backgroundElement,
                      borderColor: priority === p.value ? p.color : theme.border,
                    },
                  ]}
                >
                  <ThemedText
                    type="small"
                    style={{ color: priority === p.value ? "#fff" : theme.text, fontWeight: "600" }}
                  >
                    {p.label}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </FieldGroup>

          {/* Date */}
          <FieldGroup label="Date">
            <View style={styles.row}>
              <Chip label="Avec date" selected={hasDate} onPress={() => setHasDate((v) => !v)} />
            </View>
            {hasDate ? (
              <View style={styles.stack}>
                <TextInput
                  value={dateText}
                  onChangeText={setDateText}
                  placeholder="AAAA-MM-JJ"
                  placeholderTextColor={theme.textSecondary}
                  style={[
                    styles.input,
                    {
                      color: theme.text,
                      borderColor: theme.border,
                      backgroundColor: theme.background,
                    },
                  ]}
                />
                <Chip label="Avec heure" selected={hasTime} onPress={() => setHasTime((v) => !v)} />
                {hasTime ? (
                  <TextInput
                    value={timeText}
                    onChangeText={setTimeText}
                    placeholder="HH:MM"
                    placeholderTextColor={theme.textSecondary}
                    style={[
                      styles.input,
                      {
                        color: theme.text,
                        borderColor: theme.border,
                        backgroundColor: theme.background,
                      },
                    ]}
                  />
                ) : null}
              </View>
            ) : null}
          </FieldGroup>

          {/* Recurrence */}
          {hasDate ? (
            <FieldGroup label="Répéter chaque semaine (jours)">
              <View style={styles.row}>
                {WEEKDAYS.map((d, index) => (
                  <Pressable
                    key={`${d.value}-${index}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Répéter le ${d.label}`}
                    onPress={() =>
                      setRecurrenceDays((prev) =>
                        prev.includes(d.value)
                          ? prev.filter((x) => x !== d.value)
                          : [...prev, d.value]
                      )
                    }
                    style={[
                      styles.dayChip,
                      {
                        backgroundColor: recurrenceDays.includes(d.value)
                          ? theme.primary
                          : theme.backgroundElement,
                        borderColor: recurrenceDays.includes(d.value)
                          ? theme.primary
                          : theme.border,
                      },
                    ]}
                  >
                    <ThemedText
                      type="small"
                      style={{ color: recurrenceDays.includes(d.value) ? "#fff" : theme.text }}
                    >
                      {d.label}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
              {recurrenceDays.length > 0 ? (
                <View style={styles.stack}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Toutes les {recurrenceInterval} semaine(s)
                  </ThemedText>
                  <View style={styles.row}>
                    <Chip
                      label="−"
                      onPress={() => setRecurrenceInterval((v) => Math.max(1, v - 1))}
                    />
                    <Chip
                      label="＋"
                      onPress={() => setRecurrenceInterval((v) => Math.min(52, v + 1))}
                    />
                  </View>
                </View>
              ) : null}
            </FieldGroup>
          ) : null}

          {/* Tags */}
          <FieldGroup label="Tags (séparés par des virgules)">
            <TextInput
              value={tagsText}
              onChangeText={setTagsText}
              placeholder="travail, maison"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.input,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
              ]}
            />
          </FieldGroup>

          {/* Subtasks */}
          <FieldGroup label={`Sous-tâches (${subtasks.length})`}>
            <View style={styles.stack}>
              {subtasks.map((st) => (
                <Pressable
                  key={st.id}
                  accessibilityRole="button"
                  onPress={() =>
                    setSubtasks((prev) =>
                      prev.map((s) =>
                        s.id === st.id ? { ...s, is_completed: !s.is_completed } : s
                      )
                    )
                  }
                  style={({ pressed }) => [styles.subtaskRow, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <Ionicons
                    name={st.is_completed ? "checkbox" : "checkbox-outline"}
                    size={18}
                    color={st.is_completed ? theme.primary : theme.textSecondary}
                  />
                  <ThemedText
                    type="small"
                    style={[styles.subtaskTitle, st.is_completed && styles.subtaskDone]}
                  >
                    {st.title}
                  </ThemedText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Supprimer ${st.title}`}
                    onPress={() => setSubtasks((prev) => prev.filter((s) => s.id !== st.id))}
                    hitSlop={8}
                  >
                    <Ionicons name="close" size={16} color={theme.danger} />
                  </Pressable>
                </Pressable>
              ))}
              <View style={styles.subtaskAddRow}>
                <TextInput
                  value={newSubtask}
                  onChangeText={setNewSubtask}
                  onSubmitEditing={addSubtask}
                  placeholder="Ajouter une sous-tâche"
                  placeholderTextColor={theme.textSecondary}
                  returnKeyType="done"
                  style={[
                    styles.input,
                    {
                      flex: 1,
                      color: theme.text,
                      borderColor: theme.border,
                      backgroundColor: theme.background,
                    },
                  ]}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={addSubtask}
                  style={styles.subtaskAddButton}
                >
                  <Ionicons name="add" size={20} color={theme.primary} />
                </Pressable>
              </View>
            </View>
          </FieldGroup>

          {/* Description */}
          <FieldGroup label="Description">
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Notes (optionnel)"
              placeholderTextColor={theme.textSecondary}
              multiline
              style={[
                styles.input,
                styles.description,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
              ]}
            />
          </FieldGroup>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.back()}
              style={[styles.saveButton, { backgroundColor: theme.backgroundElement }]}
            >
              <ThemedText>Annuler</ThemedText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={!title.trim() || isSavingSomething}
              onPress={handleSave}
              style={({ pressed }) => [
                styles.saveButton,
                {
                  backgroundColor: theme.primary,
                  opacity: pressed || !title.trim() || isSavingSomething ? 0.55 : 1,
                },
              ]}
            >
              <ThemedText style={{ color: "#fff", fontWeight: "700" }}>
                {editingId ? "Enregistrer" : "Créer"}
              </ThemedText>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fieldGroup}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label}
      </ThemedText>
      {children}
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.primary : theme.backgroundElement,
          borderColor: selected ? theme.primary : theme.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <ThemedText type="small" style={{ color: selected ? "#fff" : theme.text, fontWeight: "600" }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toTimeInputValue(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  heading: {
    marginBottom: Spacing.two,
  },
  titleInput: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    minHeight: 48,
    fontSize: FontSizes.lg,
  },
  fieldGroup: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: "row",
    gap: Spacing.two,
    flexWrap: "wrap",
  },
  stack: {
    gap: Spacing.two,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderWidth: 1,
  },
  dayChip: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.three,
    minHeight: 42,
    fontSize: FontSizes.md,
  },
  description: {
    minHeight: 80,
    paddingTop: Spacing.two,
  },
  subtaskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  subtaskTitle: {
    flex: 1,
  },
  subtaskDone: {
    textDecorationLine: "line-through",
    color: "#7d8790",
  },
  subtaskAddRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  subtaskAddButton: {
    padding: Spacing.two,
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  saveButton: {
    flex: 1,
    alignItems: "center",
    borderRadius: Radius.sm,
    paddingVertical: Spacing.three,
  },
});

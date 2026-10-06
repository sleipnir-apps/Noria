import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MaxContentWidth, Radius, Spacing } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useTheme } from "@/hooks/use-theme";
import { InlineDateTimePicker } from "@/components/tasks/inline-date-time-picker";
import { PriorityPicker } from "@/components/tasks/priority-picker";
import { SubtaskList } from "@/components/tasks/subtask-list";
import { TagInput } from "@/components/tasks/tag-input";
import { WeekdayPicker } from "@/components/tasks/weekday-picker";
import { formatChipTime, localDateText } from "@/features/tasks/local-date";
import {
  formValuesFromTask,
  taskFormSchema,
  type TaskFormValues,
} from "@/features/tasks/task-form";
import { useTaskActions } from "@/features/tasks/use-task-mutations";
import { useTasksState } from "@/features/tasks/use-tasks";
import type { LocalTask } from "@/store/task.store";

/**
 * Task editor (create / edit) + occurrence editor. Route params pick the mode:
 * - none                         → create (dateless)
 * - { date: "YYYY-MM-DD" }       → create with a prefilled date
 * - { id }                       → edit a stored task / instance
 * - { parent: id, date: "iso" }  → edit a computed occurrence
 * Occurrence saves materialize (or update) an instance server-side via the
 * offline queue — the parent (the series) is never modified (V1 semantics).
 */
export default function TaskEditorScreen() {
  const router = useRouter();
  const actions = useTaskActions();
  const { tasks } = useTasksState();
  const params = useLocalSearchParams<{
    id?: string | string[];
    parent?: string | string[];
    date?: string | string[];
  }>();

  const paramId = textParam(params.id);
  const paramDate = textParam(params.date);
  const paramParent = textParam(params.parent);

  // Resolution order: stored doc (id) > occurrence (parent+date) > blank form.
  const target = useMemo(() => {
    if (paramId !== undefined) {
      const doc = tasks[paramId];
      return doc === undefined || doc.deletedAt !== undefined
        ? { kind: "missing" as const }
        : { kind: "edit" as const, doc };
    }
    if (paramParent !== undefined && paramDate !== undefined) {
      const parent = tasks[paramParent];
      if (parent === undefined || parent.recurrenceRule === undefined) {
        return { kind: "missing" as const };
      }
      const instance = Object.values(tasks).find(
        (task) =>
          task.parentTaskId === paramParent &&
          task.originalDueDate === paramDate &&
          task.deletedAt === undefined
      );
      if (instance !== undefined) return { kind: "edit" as const, doc: instance };
      return { kind: "occurrence" as const, parent, originalDueDate: paramDate };
    }
    return { kind: "create" as const };
  }, [paramId, paramParent, paramDate, tasks]);

  if (target.kind === "missing") {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView edges={["top"]} style={styles.safeArea}>
          <ThemedText type="subtitle">Tâche introuvable</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Elle n'est pas encore synchronisée sur cet appareil.
          </ThemedText>
          <Pressable onPress={() => router.back()} style={styles.linkRow}>
            <ThemedText type="linkPrimary">Retour</ThemedText>
          </Pressable>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <EditorForm
      actions={actions}
      target={target}
      paramDate={paramDate}
      onDone={() => router.back()}
    />
  );
}

// ── Form (isolated so defaultValues are computed once per mount) ─────────────

type EditorTarget =
  | { kind: "edit"; doc: LocalTask }
  | { kind: "occurrence"; parent: LocalTask; originalDueDate: string }
  | { kind: "create" };

function EditorForm({
  target,
  paramDate,
  onDone,
  actions,
}: {
  actions: ReturnType<typeof useTaskActions>;
  target: Exclude<EditorTarget, { kind: "missing" }>;
  paramDate?: string;
  onDone: () => void;
}) {
  const theme = useTheme();

  const defaults = useMemo((): TaskFormValues => {
    if (target.kind === "edit") return formValuesFromTask(target.doc);
    if (target.kind === "occurrence") {
      const values = formValuesFromTask(target.parent);
      return {
        ...values,
        dateText: localDateText(new Date(target.originalDueDate)),
        timeText: target.parent.hasTime ? formatChipTime(target.originalDueDate) : "",
      };
    }
    const values = formValuesFromTask(blankTask());
    return paramDate !== undefined ? { ...values, dateText: paramDate } : values;
  }, [target, paramDate]);

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: defaults,
  });

  const values = watch();
  // Instances of a series are edited as plain tasks; recurring parents show
  // the recurrence editor.
  const isInstance = target.kind === "edit" && target.doc.parentTaskId !== undefined;

  const save = handleSubmit(async (form) => {
    if (target.kind === "edit") {
      await actions.updateFromForm(target.doc, form);
      onDone();
      return;
    }
    if (target.kind === "occurrence") {
      await actions.updateOccurrenceFromForm(target.parent.id, target.originalDueDate, form);
      onDone();
      return;
    }
    await actions.createFromForm(form);
    onDone();
  });

  const remove = async (): Promise<void> => {
    if (target.kind === "edit") {
      await actions.remove(target.doc);
    }
    onDone();
  };

  const heading =
    target.kind === "edit"
      ? "Modifier la tâche"
      : target.kind === "occurrence"
        ? "Occurrence récurrente"
        : "Nouvelle tâche";
  const isOccurrenceEdit = target.kind === "occurrence";
  const canDelete = target.kind === "edit";

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { maxWidth: MaxContentWidth, paddingBottom: Spacing.six },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <ThemedText type="subtitle">{heading}</ThemedText>
          {isOccurrenceEdit && (
            <ThemedText type="small" themeColor="textSecondary">
              Les changements s'appliquent uniquement à la journée du{" "}
              {localDateText(new Date(target.originalDueDate))} : la série n'est pas modifiée.
            </ThemedText>
          )}

          {isOccurrenceEdit && (
            <Pressable
              onPress={async () => {
                await actions.completeOccurrence(target.parent.id, target.originalDueDate, true);
                onDone();
              }}
              style={styles.completeRow}
            >
              <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
              <ThemedText type="linkPrimary">Marquer cette occurrence comme terminée</ThemedText>
            </Pressable>
          )}

          <View style={styles.field}>
            <ThemedText type="smallBold">Titre</ThemedText>
            <Controller
              control={control}
              name="title"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  value={value}
                  onChangeText={onChange}
                  placeholder="Que faut-il faire ?"
                  placeholderTextColor={theme.textSecondary}
                  maxLength={100}
                  style={[
                    styles.input,
                    {
                      color: theme.text,
                      borderColor: errors.title ? theme.danger : theme.border,
                      backgroundColor: theme.background,
                    },
                  ]}
                />
              )}
            />
            {errors.title !== undefined && (
              <ThemedText type="small" themeColor="danger">
                {errors.title.message}
              </ThemedText>
            )}
          </View>

          <View style={styles.field}>
            <ThemedText type="smallBold">Description</ThemedText>
            <Controller
              control={control}
              name="description"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  value={value}
                  onChangeText={onChange}
                  placeholder="Détails facultatifs"
                  placeholderTextColor={theme.textSecondary}
                  maxLength={500}
                  multiline
                  style={[
                    styles.input,
                    styles.multiline,
                    {
                      color: theme.text,
                      borderColor: errors.description ? theme.danger : theme.border,
                      backgroundColor: theme.background,
                    },
                  ]}
                />
              )}
            />
            {errors.description !== undefined && (
              <ThemedText type="small" themeColor="danger">
                {errors.description.message}
              </ThemedText>
            )}
          </View>

          <View style={styles.field}>
            <ThemedText type="smallBold">Priorité</ThemedText>
            <PriorityPicker
              value={values.priority}
              onChange={(priority) => setValue("priority", priority, { shouldValidate: true })}
            />
          </View>

          <View style={styles.field}>
            <ThemedText type="smallBold">Échéance</ThemedText>
            <InlineDateTimePicker
              dateText={values.dateText}
              timeText={values.timeText}
              onDateChange={(dateText) => setValue("dateText", dateText, { shouldValidate: true })}
              onTimeChange={(timeText) => setValue("timeText", timeText, { shouldValidate: true })}
            />
            {errors.dateText !== undefined && (
              <ThemedText type="small" themeColor="danger" style={styles.error}>
                {errors.dateText.message}
              </ThemedText>
            )}
            {errors.timeText !== undefined && (
              <ThemedText type="small" themeColor="danger" style={styles.error}>
                {errors.timeText.message}
              </ThemedText>
            )}
          </View>

          {!isInstance && (
            <View style={styles.field}>
              <ThemedText type="smallBold">Répéter chaque semaine</ThemedText>
              {values.recurrenceEnabled && (
                <Pressable
                  onPress={() => {
                    setValue("recurrenceEnabled", false);
                    setValue("recurrenceWeekdays", []);
                  }}
                  hitSlop={6}
                >
                  <ThemedText type="linkPrimary">Ne plus répéter</ThemedText>
                </Pressable>
              )}
              <WeekdayPicker
                selected={values.recurrenceEnabled ? values.recurrenceWeekdays : []}
                onChange={(weekdays) => {
                  if (!values.recurrenceEnabled) setValue("recurrenceEnabled", true);
                  setValue("recurrenceWeekdays", weekdays, { shouldValidate: true });
                }}
              />
              {errors.recurrenceWeekdays !== undefined && (
                <ThemedText type="small" themeColor="danger" style={styles.error}>
                  {errors.recurrenceWeekdays.message}
                </ThemedText>
              )}
            </View>
          )}

          <View style={styles.field}>
            <ThemedText type="smallBold">Sous-tâches</ThemedText>
            <SubtaskList
              subtasks={values.subtasks}
              onChange={(subtasks) => setValue("subtasks", subtasks)}
            />
          </View>

          <View style={styles.field}>
            <ThemedText type="smallBold">Étiquettes</ThemedText>
            <TagInput tags={values.tags} onChange={(tags) => setValue("tags", tags)} />
          </View>

          <View style={styles.footer}>
            <Pressable
              onPress={() => void save()}
              style={[styles.saveButton, { backgroundColor: theme.primary }]}
              accessibilityLabel="Enregistrer"
            >
              <ThemedText themeColor="onPrimary">Enregistrer</ThemedText>
            </Pressable>
            {canDelete && (
              <Pressable onPress={() => void remove()} accessibilityLabel="Supprimer la tâche">
                <ThemedText themeColor="danger">Supprimer</ThemedText>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function blankTask(): LocalTask {
  const now = new Date().toISOString();
  return {
    id: "",
    title: "",
    priority: "P3",
    status: "TODO",
    hasTime: false,
    tags: [],
    subtasks: [],
    createdAt: now,
    updatedAt: now,
  };
}

function textParam(value: string | string[] | undefined): string | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  return value;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    alignSelf: "center",
    width: "100%",
    padding: Spacing.three,
    gap: Spacing.four,
  },
  field: {
    gap: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    fontSize: 15,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  completeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  footer: {
    gap: Spacing.three,
    alignItems: "flex-start",
  },
  saveButton: {
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  linkRow: {
    marginTop: Spacing.three,
  },
  error: {
    marginTop: -Spacing.two,
  },
});

import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { BottomTabInset, FontSizes, MaxContentWidth, Radius, Spacing } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { OfflineBanner } from "@/components/tasks/offline-banner";
import { TaskSection } from "@/components/tasks/task-section";
import { useTheme } from "@/hooks/use-theme";
import type { TaskItem } from "@/features/tasks/task-views";
import { useBacklogTasks } from "@/features/tasks/use-tasks";
import { useTaskActions } from "@/features/tasks/use-task-mutations";

/**
 * Backlog: dateless open tasks, sorted by priority then creation date.
 * Creating from here starts a dateless task (to date it later, or never).
 */
export default function BacklogScreen() {
  const router = useRouter();
  const theme = useTheme();
  const backlog = useBacklogTasks();
  const actions = useTaskActions();

  const open = (item: TaskItem): void => {
    router.push({ pathname: "/(app)/task-editor", params: { id: item.id } });
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { maxWidth: MaxContentWidth, paddingBottom: BottomTabInset + Spacing.five },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View>
              <ThemedText type="subtitle">Backlog</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {backlog.length === 0
                  ? "Tout est traité."
                  : `${backlog.length} tâche${backlog.length > 1 ? "s" : ""} sans date`}
              </ThemedText>
            </View>
            <Pressable
              onPress={() => router.push("/(app)/task-editor")}
              style={[styles.addButton, { backgroundColor: theme.primary }]}
              accessibilityLabel="Nouvelle tâche sans date"
            >
              <Ionicons name="add" size={FontSizes.lg} color={theme.onPrimary} />
              <ThemedText themeColor="onPrimary">Nouvelle</ThemedText>
            </Pressable>
          </View>

          <OfflineBanner />

          <TaskSection
            label="Sans date"
            count={backlog.length}
            items={backlog}
            emptyLabel="Ajoutez ici les tâches à traiter sans contrainte de date."
            onOpen={open}
            onToggleDone={(item) => actions.toggleDone(item.task)}
          />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
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
    gap: Spacing.three,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.half,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});

import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Radius, Spacing } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";
import { localDateText } from "@/features/tasks/local-date";

const DEFAULT_TIME = "09:00";

/**
 * Due date (+ optional time) editor shared on every platform: ISO text input
 * "AAAA-MM-JJ" with quick "Aujourd'hui / Demain" chips, and a time toggle
 * ("has_time"). Empty date = backlog item.
 */
export function DueDateFields({
  dateText,
  timeText,
  onDateChange,
  onTimeChange,
}: {
  dateText: string;
  timeText: string;
  onDateChange: (dateText: string) => void;
  onTimeChange: (timeText: string) => void;
}) {
  const theme = useTheme();
  const today = localDateText(new Date());
  const tomorrow = localDateText(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const hasTime = timeText !== "";

  const toggleTime = (): void => {
    onTimeChange(hasTime ? "" : DEFAULT_TIME);
  };

  return (
    <View style={styles.container}>
      <View style={styles.adder}>
        <TextInput
          value={dateText}
          onChangeText={onDateChange}
          placeholder="AAAA-MM-JJ (vide = backlog)"
          placeholderTextColor={theme.textSecondary}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
          style={[
            styles.input,
            { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
          ]}
          accessibilityLabel="Échéance"
        />
        <Pressable
          onPress={() => onDateChange(today)}
          style={[styles.chip, { backgroundColor: theme.backgroundSelected }]}
        >
          <ThemedText type="small">Aujourd'hui</ThemedText>
        </Pressable>
        <Pressable
          onPress={() => onDateChange(tomorrow)}
          style={[styles.chip, { backgroundColor: theme.backgroundSelected }]}
        >
          <ThemedText type="small">Demain</ThemedText>
        </Pressable>
      </View>

      {dateText !== "" && (
        <View style={styles.timeRow}>
          <Pressable
            onPress={toggleTime}
            accessibilityLabel={hasTime ? "Retirer l'heure" : "Ajouter une heure"}
            style={[
              styles.chip,
              { backgroundColor: hasTime ? theme.primary : theme.backgroundSelected },
            ]}
          >
            <Ionicons
              name="time"
              size={14}
              color={hasTime ? theme.onPrimary : theme.textSecondary}
            />
            <ThemedText type="small" themeColor={hasTime ? "onPrimary" : "text"}>
              Heure
            </ThemedText>
          </Pressable>
          {hasTime && (
            <TextInput
              value={timeText}
              onChangeText={onTimeChange}
              placeholder="HH:MM"
              placeholderTextColor={theme.textSecondary}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              style={[
                styles.input,
                styles.timeInput,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
              ]}
              accessibilityLabel="Heure"
            />
          )}
        </View>
      )}

      {dateText !== "" && (
        <Pressable onPress={() => onDateChange("")} hitSlop={6}>
          <ThemedText type="linkPrimary" style={styles.link}>
            Retirer la date (revenir au backlog)
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  adder: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.half,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    fontSize: 14,
  },
  timeInput: {
    width: 80,
    flex: 0,
  },
  link: {
    alignSelf: "flex-start",
  },
});

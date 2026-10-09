import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Radius, Spacing } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { DatePickerSheet } from "@/components/tasks/date-picker-sheet";
import { TimePickerSheet } from "@/components/tasks/time-picker-sheet";
import { useTheme } from "@/hooks/use-theme";
import { formatChipDate, localDateText, parseLocalDayKey } from "@/features/tasks/local-date";

/** Stored day key → human chip label; unparsable drafts just offer picking. */
const dateLabelOf = (dateText: string): string => {
  const parsed = parseLocalDayKey(dateText);
  return parsed === null ? "Choisir une date" : formatChipDate(parsed.toISOString());
};

/**
 * Due date (+ optional time) editor shared on every platform: a calendar sheet
 * picks the day, steppers pick the time — no free-text entry at all, so only
 * valid values reach the form. Empty date = backlog item.
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
  const [showDateSheet, setShowDateSheet] = useState(false);
  const [showTimeSheet, setShowTimeSheet] = useState(false);
  const today = localDateText(new Date());
  const tomorrow = localDateText(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const hasTime = timeText !== "";

  const removeDate = (): void => {
    onDateChange("");
    onTimeChange("");
  };

  return (
    <View style={styles.container}>
      <View style={styles.adder}>
        <Pressable
          onPress={() => setShowDateSheet(true)}
          style={[
            styles.dateButton,
            { borderColor: theme.border, backgroundColor: theme.backgroundElement },
          ]}
          accessibilityLabel="Échéance"
        >
          <Ionicons name="calendar" size={14} color={theme.textSecondary} />
          <ThemedText type="small" themeColor={dateText === "" ? "textSecondary" : "text"}>
            {dateLabelOf(dateText)}
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={() => onDateChange(today)}
          style={[styles.chip, { backgroundColor: theme.backgroundSelected }]}
          accessibilityLabel="Choisir aujourd'hui"
        >
          <ThemedText type="small">Aujourd'hui</ThemedText>
        </Pressable>
        <Pressable
          onPress={() => onDateChange(tomorrow)}
          style={[styles.chip, { backgroundColor: theme.backgroundSelected }]}
          accessibilityLabel="Choisir demain"
        >
          <ThemedText type="small">Demain</ThemedText>
        </Pressable>
      </View>

      {dateText !== "" && (
        <Pressable
          onPress={() => setShowTimeSheet(true)}
          style={[
            styles.chip,
            {
              backgroundColor: hasTime ? theme.primary : theme.backgroundSelected,
              alignSelf: "flex-start",
            },
          ]}
          accessibilityLabel={hasTime ? "Modifier l'heure" : "Ajouter une heure"}
        >
          <Ionicons name="time" size={14} color={hasTime ? theme.onPrimary : theme.textSecondary} />
          <ThemedText type="small" themeColor={hasTime ? "onPrimary" : "text"}>
            {hasTime ? timeText : "Heure"}
          </ThemedText>
        </Pressable>
      )}

      {dateText !== "" && (
        <Pressable onPress={removeDate} hitSlop={6}>
          <ThemedText type="linkPrimary" style={styles.link}>
            Retirer la date (revenir au backlog)
          </ThemedText>
        </Pressable>
      )}

      <DatePickerSheet
        visible={showDateSheet}
        selectedDateText={dateText}
        onPick={onDateChange}
        onClose={() => setShowDateSheet(false)}
      />
      <TimePickerSheet
        visible={showTimeSheet}
        timeText={timeText}
        onPick={onTimeChange}
        onClear={() => onTimeChange("")}
        onClose={() => setShowTimeSheet(false)}
      />
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
  dateButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.half,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.half,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  link: {
    alignSelf: "flex-start",
  },
});

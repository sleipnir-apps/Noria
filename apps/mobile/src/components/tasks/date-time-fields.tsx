import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Radius, Spacing } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { CalendarPicker } from "@/components/tasks/calendar-picker";
import { useTheme } from "@/hooks/use-theme";
import { dayKeyToIso, formatChipDate, localDateText } from "@/features/tasks/local-date";

const DEFAULT_TIME = "09:00";

/** Stored day key → human chip label; unparsable drafts just offer picking. */
const dateLabelOf = (dateText: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return "Choisir une date";
  return formatChipDate(dayKeyToIso(dateText));
};

/**
 * Due date (+ optional time) editor shared on every platform: a light
 * one-tap calendar sheet (quick chips + month grid) instead of a typed
 * "AAAA-MM-JJ", and a time toggle defaulting to 09:00. Empty date = backlog.
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
  const [showCalendar, setShowCalendar] = useState(false);
  const hasTime = timeText !== "";

  const toggleTime = (): void => {
    onTimeChange(hasTime ? "" : DEFAULT_TIME);
  };

  const tomorrow = localDateText(new Date(Date.now() + 24 * 60 * 60 * 1000));

  return (
    <View style={styles.container}>
      <View style={styles.adder}>
        <Pressable
          onPress={() => setShowCalendar(true)}
          style={[
            styles.dateButton,
            { borderColor: theme.border, backgroundColor: theme.background },
          ]}
          accessibilityLabel="Échéance : choisir une date"
        >
          <Ionicons name="calendar" size={14} color={theme.textSecondary} />
          <ThemedText type="small" themeColor={dateText === "" ? "textSecondary" : "text"}>
            {dateLabelOf(dateText)}
          </ThemedText>
          {dateText === "" && (
            <ThemedText type="small" themeColor="textSecondary">
              (vide = backlog)
            </ThemedText>
          )}
        </Pressable>
        <Pressable
          onPress={() => onDateChange(localDateText(new Date()))}
          style={[styles.chip, { backgroundColor: theme.backgroundSelected }]}
          accessibilityLabel="Aujourd'hui"
        >
          <ThemedText type="small">Aujourd'hui</ThemedText>
        </Pressable>
        <Pressable
          onPress={() => onDateChange(tomorrow)}
          style={[styles.chip, { backgroundColor: theme.backgroundSelected }]}
          accessibilityLabel="Demain"
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
              {hasTime ? timeText : "Heure"}
            </ThemedText>
          </Pressable>
          {!hasTime && (
            <ThemedText type="small" themeColor="textSecondary">
              Toucher pour fixer une heure — sinon échéance à minuit.
            </ThemedText>
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

      <CalendarPicker
        visible={showCalendar}
        value={dateText}
        onPick={onDateChange}
        onClose={() => setShowCalendar(false)}
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
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
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
  link: {
    alignSelf: "flex-start",
  },
});

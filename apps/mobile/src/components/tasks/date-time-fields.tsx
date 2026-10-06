import { Pressable, StyleSheet, View } from "react-native";
import { ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Radius, Spacing } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";
import { formatChipDate, localDateText } from "@/features/tasks/local-date";

const QUICK_DAYS = 6; // chips: today + next 5 days

function addDays(base: Date, days: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
}

function textOf(date: Date): string {
  return localDateText(date);
}

/**
 * Due date picker, redesigned (fix): instead of a free-text "AAAA-MM-JJ"
 * input — error-prone — the picker is now chip-based:
 *  - a quick chip "Aujourd'hui" and one per the next 5 days (horizontal row,
 *    each showing weekday short name + day number);
 *  - back/forward stepper buttons to shift the selection by one day
 *    (crosses weeks, keeps the same state contract);
 *  - an optional time row: toggle (defaults 09:00), ±15 min steppers and
 *    three quick slots (matin / après-midi / soir).
 * Zero new dependency; the form schema and parseDueDateInput are untouched.
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
  const today = new Date();
  const selected =
    dateText !== "" && /^\d{4}-\d{2}-\d{2}$/.test(dateText)
      ? new Date(`${dateText}T12:00:00`)
      : null;
  const hasTime = timeText !== "";

  // Quick chips: today + 5 following days.
  const chips = Array.from({ length: QUICK_DAYS }, (_, i) => addDays(today, i));

  const stepDay = (delta: number): void => {
    const base = selected ?? today;
    onDateChange(textOf(addDays(base, delta)));
  };

  const setTime = (next: string): void => {
    // Setting a time on a dateless task first anchors today.
    if (dateText === "") onDateChange(textOf(today));
    onTimeChange(next);
  };

  const adjustTime = (minutes: number): void => {
    const current = hasTime ? parseMinutes(timeText) : 9 * 60; // default 09:00
    const clamped = Math.min(23 * 60 + 45, Math.max(0, current + minutes));
    setTime(formatMinutes(clamped));
  };

  return (
    <View style={styles.container}>
      <View style={styles.stepperRow}>
        <Pressable
          onPress={() => stepDay(-1)}
          hitSlop={8}
          accessibilityLabel="Jour précédent"
          style={[styles.stepButton, { borderColor: theme.border }]}
        >
          <Ionicons name="chevron-back" size={16} color={theme.text} />
        </Pressable>
        <View
          style={[
            styles.currentDate,
            { borderColor: theme.border, backgroundColor: theme.background },
          ]}
        >
          <ThemedText style={styles.currentDateText}>
            {selected ? formatChipDate(selected.toISOString()) : "Sans date (backlog)"}
          </ThemedText>
        </View>
        <Pressable
          onPress={() => stepDay(1)}
          hitSlop={8}
          accessibilityLabel="Jour suivant"
          style={[styles.stepButton, { borderColor: theme.border }]}
        >
          <Ionicons name="chevron-forward" size={16} color={theme.text} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {chips.map((chip) => {
          const text = textOf(chip);
          const active = dateText === text;
          return (
            <Pressable
              key={text}
              onPress={() => onDateChange(active ? "" : text)}
              style={[
                styles.dayChip,
                { backgroundColor: active ? theme.primary : theme.backgroundSelected },
              ]}
              accessibilityLabel={
                chip.getDate() === today.getDate() ? "Choisir aujourd'hui" : `Choisir le ${text}`
              }
            >
              <ThemedText
                type="small"
                themeColor={active ? "onPrimary" : "text"}
                style={styles.dayChipWeekday}
              >
                {chip.getDate() === today.getDate()
                  ? "Auj."
                  : new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(chip)}
              </ThemedText>
              <ThemedText
                type="small"
                themeColor={active ? "onPrimary" : "text"}
                style={styles.dayChipDay}
              >
                {chip.getDate()}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>

      {dateText !== "" && (
        <View style={styles.timeRow}>
          <Ionicons name="time-outline" size={16} color={theme.textSecondary} />
          <Pressable
            onPress={() => onTimeChange(hasTime ? "" : "09:00")}
            accessibilityLabel={hasTime ? "Retirer l'heure" : "Ajouter l'heure"}
            style={[
              styles.timeToggle,
              { backgroundColor: hasTime ? theme.primary : theme.backgroundSelected },
            ]}
          >
            <ThemedText type="small" themeColor={hasTime ? "onPrimary" : "text"}>
              {hasTime ? timeText : "Heure ?"}
            </ThemedText>
          </Pressable>
          {hasTime && (
            <View style={styles.timeSteppers}>
              <Pressable
                onPress={() => adjustTime(-15)}
                hitSlop={6}
                accessibilityLabel="Moins 15 minutes"
                style={[styles.miniStep, { borderColor: theme.border }]}
              >
                <Ionicons name="remove" size={14} color={theme.text} />
              </Pressable>
              <Pressable
                onPress={() => adjustTime(15)}
                hitSlop={6}
                accessibilityLabel="Plus 15 minutes"
                style={[styles.miniStep, { borderColor: theme.border }]}
              >
                <Ionicons name="add" size={14} color={theme.text} />
              </Pressable>
            </View>
          )}
          <View style={styles.quickTimes}>
            {(["09:00", "14:00", "18:00"] as const).map((slot) => (
              <Pressable
                key={slot}
                onPress={() => setTime(slot)}
                style={[
                  styles.slotChip,
                  {
                    backgroundColor: timeText === slot ? theme.primary : theme.backgroundSelected,
                  },
                ]}
              >
                <ThemedText type="small" themeColor={timeText === slot ? "onPrimary" : "text"}>
                  {slot === "09:00" ? "matin" : slot === "14:00" ? "après-midi" : "soir"}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {dateText !== "" && (
        <Pressable onPress={() => onDateChange("")} hitSlop={6}>
          <ThemedText type="linkPrimary" style={styles.link}>
            Retirer la date (revenir au backlog)
          </ThemedText>
        </Pressable>
      )}
      {dateText === "" && (
        <Pressable onPress={() => onDateChange(textOf(today))} hitSlop={6}>
          <ThemedText type="linkPrimary" style={styles.link}>
            Dater pour aujourd'hui
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

function parseMinutes(text: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text);
  if (!match) return 9 * 60;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  stepButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  currentDate: {
    flex: 1,
    height: 36,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  currentDateText: {
    fontSize: 15,
  },
  chipRow: {
    gap: Spacing.one,
    paddingVertical: 2,
  },
  dayChip: {
    width: 46,
    borderRadius: Radius.sm,
    paddingVertical: Spacing.one,
    alignItems: "center",
    gap: 1,
  },
  dayChipWeekday: {
    fontSize: 11,
    textTransform: "capitalize",
  },
  dayChipDay: {
    fontWeight: "700",
    fontSize: 15,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    flexWrap: "wrap",
  },
  timeToggle: {
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  timeSteppers: {
    flexDirection: "row",
    gap: Spacing.one,
  },
  miniStep: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  quickTimes: {
    flexDirection: "row",
    gap: Spacing.one,
  },
  slotChip: {
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  link: {
    alignSelf: "flex-start",
  },
});

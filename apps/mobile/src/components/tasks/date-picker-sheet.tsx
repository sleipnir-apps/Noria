import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Radius, Spacing, FontSizes } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { PickerShell } from "@/components/tasks/picker-shell";
import { useTheme } from "@/hooks/use-theme";
import { formatChipDate, localDateText, parseLocalDayKey } from "@/features/tasks/local-date";
import { buildMonthGrid, monthTitle } from "@/features/tasks/date-grid";
import { weekdayLabels } from "@/features/tasks/task-views";

/** A day key → the instant its a11y label describes (null-safe → today). */
const pickDateOf = (dateText: string): Date => parseLocalDayKey(dateText) ?? new Date();

/**
 * Month-calendar sheet to pick a due date (replaces the old "AAAA-MM-JJ"
 * text input): nothing to type, always a valid date, works on every platform
 * with no extra dependency. One tap picks the day and closes the sheet.
 */
export function DatePickerSheet({
  visible,
  selectedDateText,
  onPick,
  onClose,
}: {
  visible: boolean;
  /** Currently selected day key "YYYY-MM-DD" ("" when none). */
  selectedDateText: string;
  onPick: (dateText: string) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [cursor, setCursor] = useState<Date>(() => cursorOf(selectedDateText));

  // Re-anchor the grid on the selected month each time the sheet opens.
  useEffect(() => {
    if (visible) setCursor(cursorOf(selectedDateText));
    // (selectedDateText is captured on purpose: only opening re-anchors.)
  }, [visible]);

  const today = localDateText(new Date());
  const weeks = buildMonthGrid(cursor);

  const pick = (dateText: string): void => {
    onPick(dateText);
    onClose();
  };

  const shiftMonth = (delta: number): void => {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  };

  const monthA11yLabel = (dateText: string): string =>
    formatChipDate(pickDateOf(dateText).toISOString());

  return (
    <PickerShell visible={visible} title={monthTitle(cursor)} onClose={onClose}>
      <View style={styles.monthNav}>
        <Pressable onPress={() => shiftMonth(-1)} hitSlop={8} accessibilityLabel="Mois précédent">
          <Ionicons name="chevron-back" size={20} color={theme.textSecondary} />
        </Pressable>
        <Pressable onPress={() => shiftMonth(1)} hitSlop={8} accessibilityLabel="Mois suivant">
          <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {weekdayLabels.map((label) => (
          <ThemedText
            key={label}
            type="small"
            themeColor="textSecondary"
            style={styles.weekdayCell}
          >
            {label}
          </ThemedText>
        ))}
      </View>

      {weeks.map((week, weekIndex) => (
        <View key={weekIndex} style={styles.weekRow}>
          {week.map((cell) => {
            const selected = cell.localDateText === selectedDateText;
            const isToday = cell.localDateText === today;
            return (
              <Pressable
                key={cell.localDateText}
                onPress={() => pick(cell.localDateText)}
                accessibilityLabel={`Choisir le ${monthA11yLabel(cell.localDateText)}`}
                style={[
                  styles.cell,
                  selected && { backgroundColor: theme.primary, borderRadius: Radius.sm },
                ]}
              >
                <ThemedText
                  style={[
                    styles.dayNumber,
                    !cell.inMonth && styles.dayOutOfMonth,
                    isToday && !selected && { color: theme.primary },
                  ]}
                  themeColor={selected ? "onPrimary" : cell.inMonth ? "text" : "textSecondary"}
                >
                  {cell.dayOfMonth}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      ))}

      <Pressable
        onPress={() => pick(today)}
        style={[styles.todayShortcut, { backgroundColor: theme.backgroundSelected }]}
        accessibilityLabel="Choisir aujourd'hui"
      >
        <Ionicons name="today" size={14} color={theme.textSecondary} />
        <ThemedText type="small">Aujourd'hui</ThemedText>
      </Pressable>
    </PickerShell>
  );
}

/** Selected day's month; the current month when nothing is selected. */
function cursorOf(selectedDateText: string): Date {
  return parseLocalDayKey(selectedDateText) ?? new Date();
}

const styles = StyleSheet.create({
  monthNav: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  weekdayRow: {
    flexDirection: "row",
  },
  weekRow: {
    flexDirection: "row",
  },
  cell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.half,
  },
  weekdayCell: {
    flex: 1,
    textAlign: "center",
  },
  dayNumber: {
    fontSize: FontSizes.sm,
    width: 32,
    height: 32,
    lineHeight: 32,
    textAlign: "center",
  },
  dayOutOfMonth: {
    opacity: 0.35,
  },
  todayShortcut: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    borderRadius: Radius.sm,
    paddingVertical: Spacing.two,
  },
});

import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FontSizes, Radius, Spacing } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useTheme } from "@/hooks/use-theme";
import {
  dayKeyToIso,
  formatChipDate,
  localDateText,
  parseLocalDayKey,
} from "@/features/tasks/local-date";

const MONTH_NAMES = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];
const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

export interface CalendarPickerProps {
  visible: boolean;
  /** Selected local date key "YYYY-MM-DD", "" = none (backlog). */
  value: string;
  onPick: (dateKey: string) => void;
  onClose: () => void;
}

/**
 * Light month-calendar picker (no heavy dependency): one tap on a day picks
 * and closes. Monday-first grid, adjacent-month days dimmed, quick chips.
 */
export function CalendarPicker({ visible, value, onPick, onClose }: CalendarPickerProps) {
  const theme = useTheme();
  // Valid draft → anchor the grid on its month; anything else → this month.
  const base = parseLocalDayKey(value) ?? new Date();
  const [year, month] = [base.getFullYear(), base.getMonth()];
  const pickKey = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;

  const cells: Array<{ key: string; day: number; inMonth: boolean }> = [];
  const firstDayOfMonth = new Date(year, month, 1);
  const leading = (firstDayOfMonth.getDay() + 6) % 7; // Monday = 0
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(year, month, 1 - leading + i);
    cells.push({
      key: localDateText(date),
      day: date.getDate(),
      inMonth: date.getMonth() === month,
    });
  }

  const quickPick = (offsetDays: number): void => {
    const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
    onPick(localDateText(date));
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer">
        <Pressable onPress={() => {}}>
          <ThemedView
            type="backgroundElement"
            style={[styles.sheet, { borderColor: theme.border }]}
          >
            <View style={styles.headerRow}>
              <ThemedText type="subtitle" style={styles.monthTitle}>
                {`${MONTH_NAMES[month]} ${year}`}
              </ThemedText>
              <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Fermer le calendrier">
                <Ionicons name="close" size={18} color={theme.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.quickRow}>
              <Pressable
                onPress={() => quickPick(0)}
                style={[styles.quickChip, { backgroundColor: theme.backgroundSelected }]}
              >
                <ThemedText type="small">Aujourd'hui</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => quickPick(1)}
                style={[styles.quickChip, { backgroundColor: theme.backgroundSelected }]}
              >
                <ThemedText type="small">Demain</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => quickPick(7)}
                style={[styles.quickChip, { backgroundColor: theme.backgroundSelected }]}
              >
                <ThemedText type="small">Semaine +1</ThemedText>
              </Pressable>
            </View>

            <View style={styles.grid}>
              {WEEKDAYS.map((label, index) => (
                <ThemedText
                  key={`${label}-${index}`}
                  type="small"
                  themeColor="textSecondary"
                  style={styles.weekday}
                >
                  {label}
                </ThemedText>
              ))}
              {cells.map((cell) => {
                const selected = cell.key === pickKey;
                return (
                  <Pressable
                    key={cell.key}
                    onPress={() => {
                      onPick(cell.key);
                      onClose();
                    }}
                    accessibilityLabel={`Choisir le ${formatChipDate(dayKeyToIso(cell.key))}`}
                    style={[
                      styles.cell,
                      selected && { backgroundColor: theme.primary, borderRadius: Radius.sm },
                      cell.inMonth && !selected && { backgroundColor: theme.backgroundSelected },
                    ]}
                  >
                    <ThemedText
                      type="small"
                      themeColor={selected ? "onPrimary" : cell.inMonth ? "text" : "textSecondary"}
                      style={!cell.inMonth && !selected ? styles.dimmed : undefined}
                    >
                      {cell.day}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    padding: Spacing.four,
  },
  sheet: {
    width: 320,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  monthTitle: {
    fontSize: FontSizes.md,
  },
  quickRow: {
    flexDirection: "row",
    gap: Spacing.two,
  },
  quickChip: {
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.half,
  },
  weekday: {
    width: `${100 / 7}%`,
    textAlign: "center",
    marginBottom: Spacing.half,
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1.4,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.sm,
  },
  dimmed: {
    opacity: 0.4,
  },
});

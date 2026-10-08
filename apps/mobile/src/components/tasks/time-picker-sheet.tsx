import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Radius, Spacing, FontSizes } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { PickerShell } from "@/components/tasks/picker-shell";
import { useTheme } from "@/hooks/use-theme";

const DEFAULT_HOUR = 9;
const MINUTE_STEP = 5;

/** Current steppers as zero-padded "HH:MM" (the format the form expects). */
const asTimeText = (hour: number, minute: number): string =>
  `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

/** "HH:MM" → steppers, null on anything else (keeps invalid text uneditable). */
const parseTimeText = (timeText: string): { hour: number; minute: number } | null => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeText.trim());
  if (match === null) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
};

/**
 * Time sheet replacing the old "HH:MM" text input: hour minutes 0–23 and
 * 5-minute steps wrap with steppers, so only valid times ever reach the form.
 * The empty value clears the time ("Supprimer l'heure") — no invisible state.
 */
export function TimePickerSheet({
  visible,
  timeText,
  onPick,
  onClear,
  onClose,
}: {
  visible: boolean;
  /** Current "HH:MM" ("" when the task has no time). */
  timeText: string;
  onPick: (timeText: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [hour, setHour] = useState(DEFAULT_HOUR);
  const [minute, setMinute] = useState(0);

  /** Stored "HH:MM" when valid, otherwise the 09:00 default. */
  const currentSelection = (): { hour: number; minute: number } =>
    parseTimeText(timeText) ?? { hour: DEFAULT_HOUR, minute: 0 };

  // Re-anchor the steppers on the stored time each time the sheet opens
  // (empty → default 09:00, like the old toggle).
  useEffect(() => {
    if (!visible) return;
    setHour(currentSelection().hour);
    setMinute(currentSelection().minute);
  }, [visible]);

  const shiftHour = (delta: number): void => {
    setHour((current) => (current + delta + 24) % 24);
  };
  const shiftMinute = (delta: number): void => {
    setMinute((current) => (current + delta * MINUTE_STEP + 60) % 60);
  };

  return (
    <PickerShell visible={visible} title="Heure" onClose={onClose}>
      <View style={styles.steppersRow}>
        <View style={styles.stepper}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.stepperLabel}>
            Heure
          </ThemedText>
          <Pressable
            onPress={() => shiftHour(-1)}
            hitSlop={8}
            accessibilityLabel="Réduire l'heure"
            style={[styles.stepperButton, { backgroundColor: theme.backgroundSelected }]}
          >
            <Ionicons name="remove" size={18} color={theme.text} />
          </Pressable>
          <ThemedText type="subtitle" style={styles.stepperValue}>
            {String(hour).padStart(2, "0")}
          </ThemedText>
          <Pressable
            onPress={() => shiftHour(1)}
            hitSlop={8}
            accessibilityLabel="Augmenter l'heure"
            style={[styles.stepperButton, { backgroundColor: theme.backgroundSelected }]}
          >
            <Ionicons name="add" size={18} color={theme.text} />
          </Pressable>
        </View>

        <View style={styles.stepper}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.stepperLabel}>
            Minutes
          </ThemedText>
          <Pressable
            onPress={() => shiftMinute(-1)}
            hitSlop={8}
            accessibilityLabel="Réduire les minutes"
            style={[styles.stepperButton, { backgroundColor: theme.backgroundSelected }]}
          >
            <Ionicons name="remove" size={18} color={theme.text} />
          </Pressable>
          <ThemedText type="subtitle" style={styles.stepperValue}>
            {String(minute).padStart(2, "0")}
          </ThemedText>
          <Pressable
            onPress={() => shiftMinute(1)}
            hitSlop={8}
            accessibilityLabel="Augmenter les minutes"
            style={[styles.stepperButton, { backgroundColor: theme.backgroundSelected }]}
          >
            <Ionicons name="add" size={18} color={theme.text} />
          </Pressable>
        </View>
      </View>

      <Pressable
        onPress={() => {
          onPick(asTimeText(hour, minute));
          onClose();
        }}
        style={[styles.actionButton, { backgroundColor: theme.primary }]}
        accessibilityLabel="Valider l'heure"
      >
        <ThemedText type="small" themeColor="onPrimary">
          Valider
        </ThemedText>
      </Pressable>
      <Pressable
        onPress={() => {
          onClear();
          onClose();
        }}
        hitSlop={6}
        accessibilityLabel="Supprimer l'heure"
      >
        <ThemedText type="linkPrimary" style={styles.clearLink}>
          Supprimer l'heure
        </ThemedText>
      </Pressable>
    </PickerShell>
  );
}

const styles = StyleSheet.create({
  steppersRow: {
    flexDirection: "row",
    justifyContent: "space-evenly",
  },
  stepper: {
    alignItems: "center",
    gap: Spacing.two,
  },
  stepperLabel: {
    textTransform: "uppercase",
  },
  stepperButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.md,
  },
  stepperValue: {
    fontSize: FontSizes.lg,
    width: 48,
    height: 48,
    lineHeight: 48,
    textAlign: "center",
    textAlignVertical: "center",
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionButton: {
    alignItems: "center",
    borderRadius: Radius.sm,
    paddingVertical: Spacing.two,
  },
  clearLink: {
    alignSelf: "center",
  },
});

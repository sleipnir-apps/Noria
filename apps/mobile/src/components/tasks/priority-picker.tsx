import { Pressable, StyleSheet, View } from "react-native";
import { FontSizes, Radius, Spacing, type ThemeColor } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";
import type { TaskPriority } from "@template/contracts";

const PRIORITIES: ReadonlyArray<{ value: TaskPriority; label: string; color: ThemeColor }> = [
  { value: "P1", label: "P1 · Urgente", color: "danger" },
  { value: "P2", label: "P2 · Haute", color: "secondary" },
  { value: "P3", label: "P3 · Normale", color: "primary" },
  { value: "P4", label: "P4 · Basse", color: "textSecondary" },
];

/**
 * Row of priority chips (P1 … P4); one selected at a time (default P3).
 * Controlled component — the editor form holds the value.
 */
export function PriorityPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: TaskPriority;
  onChange: (priority: TaskPriority) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      {PRIORITIES.map((priority) => {
        const selected = priority.value === value;
        return (
          <Pressable
            key={priority.value}
            disabled={disabled}
            onPress={() => onChange(priority.value)}
            accessibilityLabel={`Priorité ${priority.label}`}
            accessibilityState={selected ? { selected: true } : undefined}
            style={[
              styles.chip,
              { borderColor: theme[priority.color] },
              selected && {
                backgroundColor: theme[priority.color],
                borderColor: theme[priority.color],
              },
            ]}
          >
            <ThemedText
              type="small"
              themeColor={selected ? "onPrimary" : "text"}
              style={styles.label}
            >
              {priority.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  chip: {
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
  },
  label: {
    fontSize: FontSizes.sm,
  },
});

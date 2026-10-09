import { Pressable, StyleSheet, View } from "react-native";
import { Radius, Spacing } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";

/**
 * Weekday chips for the simple weekly recurrence (V1): indices follow the
 * rrule convention — 0 = Monday … 6 = Sunday — multi-select.
 */
export function WeekdayPicker({
  selected,
  onChange,
}: {
  selected: number[];
  onChange: (weekdays: number[]) => void;
}) {
  const theme = useTheme();
  const labels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  const toggle = (index: number): void => {
    onChange(
      selected.includes(index) ? selected.filter((day) => day !== index) : [...selected, index]
    );
  };

  return (
    <View style={styles.row}>
      {labels.map((label, index) => {
        const active = selected.includes(index);
        return (
          <Pressable
            key={label}
            onPress={() => toggle(index)}
            accessibilityLabel={`Récurrence ${label}`}
            accessibilityState={active ? { selected: true } : undefined}
            style={[
              styles.chip,
              { backgroundColor: active ? theme.primary : theme.backgroundSelected },
            ]}
          >
            <ThemedText type="small" themeColor={active ? "onPrimary" : "text"}>
              {label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexGrow: 1,
    alignItems: "center",
    paddingVertical: 6,
    borderRadius: Radius.sm,
  },
  row: {
    flexDirection: "row",
    gap: Spacing.two,
  },
});

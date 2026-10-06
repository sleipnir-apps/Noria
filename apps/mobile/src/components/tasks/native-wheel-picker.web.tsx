import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

/**
 * Web twin of the native wheel picker: two compact native-ish inputs
 * (<input type="date"> / <input type="time">) — browsers ship a good
 * picker UI for them, no dependency needed. Values are converted to the
 * same "YYYY-MM-DD" / "HH:MM" text contract the editor form uses.
 */

const pad = (value: number): string => String(value).padStart(2, "0");

export default function NativeWheelPicker({
  mode,
  value,
  onChange,
  accentColorRaw,
  scheme,
}: {
  mode: "date" | "time";
  value: Date;
  onChange: (date: Date) => void;
  accentColorRaw: string;
  scheme: "dark" | "light";
}) {
  const dateValue = useMemo(
    () => `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`,
    [value]
  );
  const timeValue = useMemo(() => `${pad(value.getHours())}:${pad(value.getMinutes())}`, [value]);
  const [color] = useState(accentColorRaw);
  void scheme;

  if (mode === "date") {
    return (
      <View style={styles.row}>
        <input
          type="date"
          value={dateValue}
          onChange={(event) => {
            const next = event.currentTarget.value;
            if (/^\d{4}-\d{2}-\d{2}$/.test(next)) {
              const [year, month, day] = next.split("-").map(Number) as [number, number, number];
              onChange(new Date(year, month - 1, day, value.getHours(), value.getMinutes()));
            }
          }}
          style={{ ...inputStyle, accentColor: color }}
        />
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <input
        type="time"
        value={timeValue}
        onChange={(event) => {
          const next = event.currentTarget.value;
          if (/^([01]\d|2[0-3]):[0-5]\d$/.test(next)) {
            const [hour, minute] = next.split(":").map(Number) as [number, number];
            onChange(
              new Date(value.getFullYear(), value.getMonth(), value.getDate(), hour, minute)
            );
          }
        }}
        style={{ ...inputStyle, accentColor: color }}
      />
    </View>
  );
}

const inputStyle: React.CSSProperties = {
  fontSize: 14,
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid #ccc",
  background: "transparent",
  color: "inherit",
  fontFamily: "inherit",
};

const styles = StyleSheet.create({
  row: {
    // The <input> measures itself; no flex needed.
    maxWidth: 220,
  },
});

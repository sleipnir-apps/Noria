import DateTimePicker from "@expo/ui/community/datetime-picker";

/**
 * Native wheel picker (iOS: SwiftUI wheel, Android: Material wheel).
 * `accentColorRaw`/`scheme` are pre-mapped by the caller (web twin ignores them).
 */
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
  return (
    <DateTimePicker
      value={value}
      mode={mode === "time" ? "time" : "date"}
      display="spinner"
      accentColor={accentColorRaw}
      themeVariant={scheme}
      locale="fr_FR"
      onValueChange={(_event, date) => onChange(date)}
    />
  );
}

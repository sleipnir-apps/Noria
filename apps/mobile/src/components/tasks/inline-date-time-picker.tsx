import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Radius, Spacing, type ThemeColor } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useTheme } from "@/hooks/use-theme";

/**
 * Inline expandable date (+ optional time) picker used by the task editor.
 * Collapsed: one tappable row (date chip / "Choisir une date…").
 * Expanded: a 7-day quick strip, then a wheel-style picker (native wheel on
 * iOS/Android via @expo/ui's DateTimePicker, <input type=date|time> on web).
 * A single component tree — no Platform.OS ternaries in the screens.
 */

type PickerMode = "date" | "time";

export interface InlineDateTimePickerProps {
  /** "YYYY-MM-DD" or "" (empty = no date / backlog). */
  dateText: string;
  /** "HH:MM" or "" (no time). */
  timeText: string;
  onDateChange: (dateText: string) => void;
  onTimeChange: (timeText: string) => void;
}

const DAY_MS = 86_400_000;

const pad = (value: number): string => String(value).padStart(2, "0");

const dateTextOf = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const timeTextOf = (date: Date): string => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** Local Date from "YYYY-MM-DD" (+ optional "HH:MM"), device calendar. */
function dateFromTexts(dateText: string, timeText: string): Date {
  const [year, month, day] = dateText.split("-").map(Number) as [number, number, number];
  const [hour, minute] =
    timeText !== "" ? (timeText.split(":").map(Number) as [number, number]) : [0, 0];
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

/** Short fr label of a day: "Sam 7" (weekday + day of month). */
function shortDayLabel(date: Date): string {
  const weekday = new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(date);
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1, 3)} ${date.getDate()}`;
}

export function InlineDateTimePicker({
  dateText,
  timeText,
  onDateChange,
  onTimeChange,
}: InlineDateTimePickerProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<PickerMode>("date");

  const hasDate = dateText !== "";
  const hasTime = timeText !== "";
  const today = new Date();
  const selected = hasDate ? dateFromTexts(dateText, timeText) : today;

  const quickDays: Array<{ label: string; date: Date }> = [
    { label: "Auj.", date: today },
    { label: "Demain", date: new Date(today.getTime() + DAY_MS) },
    ...Array.from({ length: 5 }, (_unused, index) => {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + index + 2);
      return { label: shortDayLabel(date), date };
    }),
  ];

  const setDay = (date: Date): void => {
    onDateChange(dateTextOf(date));
    if (timeText === "" && hasTime) return; // keep whatever the form already carries
    setMode(hasTime ? "date" : "date");
  };

  const setTime = (date: Date): void => {
    onTimeChange(timeTextOf(date));
  };

  const displayLabel = hasDate
    ? new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" }).format(
        selected
      ) + (hasTime ? ` · ${timeText}` : "")
    : undefined;

  if (!expanded) {
    return (
      <View style={styles.collapsedRow}>
        <Pressable
          onPress={() => {
            setMode("date");
            setExpanded(true);
          }}
          style={[
            styles.trigger,
            hasDate
              ? { backgroundColor: theme.backgroundSelected }
              : { borderWidth: 1, borderStyle: "dashed", borderColor: theme.border },
          ]}
          accessibilityLabel={hasDate ? `Échéance : ${displayLabel}` : "Choisir une date"}
        >
          <Ionicons
            name={hasDate ? "calendar" : "calendar-outline"}
            size={16}
            color={hasDate ? theme.text : theme.textSecondary}
          />
          <ThemedText type="small" themeColor={hasDate ? "text" : "textSecondary"}>
            {hasDate ? displayLabel : "Choisir une date…"}
          </ThemedText>
        </Pressable>
        {hasDate && (
          <>
            <Pressable
              onPress={() => {
                setMode("time");
                setExpanded(true);
              }}
              style={[
                styles.trigger,
                styles.timeTrigger,
                { backgroundColor: theme.backgroundSelected },
              ]}
              accessibilityLabel={hasTime ? `Heure : ${timeText}` : "Ajouter une heure"}
            >
              <Ionicons name="time-outline" size={16} color={theme.text} />
              <ThemedText type="small">{hasTime ? timeText : "Heure"}</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => onDateChange("")}
              hitSlop={6}
              accessibilityLabel="Retirer la date"
            >
              <Ionicons name="trash-outline" size={16} color={theme.textSecondary} />
            </Pressable>
          </>
        )}
      </View>
    );
  }

  return (
    <ThemedView type="backgroundElement" style={styles.expanded}>
      <View style={styles.expandedHeader}>
        {mode === "time" ? (
          <ThemedText type="smallBold">Heure</ThemedText>
        ) : (
          <ThemedText type="smallBold">Date</ThemedText>
        )}
        <Pressable onPress={() => setExpanded(false)} accessibilityLabel="Fermer">
          <Ionicons name="checkmark" size={18} color={theme.primary} />
        </Pressable>
      </View>

      {mode === "date" && (
        <View style={styles.quickStrip}>
          {quickDays.map((day) => {
            const picked = hasDate && dateTextOf(day.date) === dateText;
            return (
              <Pressable
                key={day.label}
                onPress={() => setDay(day.date)}
                style={[
                  styles.quickDay,
                  picked
                    ? { backgroundColor: theme.primary }
                    : { backgroundColor: theme.background },
                ]}
                accessibilityLabel={day.label}
              >
                <ThemedText
                  type="small"
                  themeColor={picked ? "onPrimary" : "text"}
                  style={styles.quickDayLabel}
                >
                  {day.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      )}

      <NativeWheelPicker
        mode={mode}
        value={selected}
        onChange={(date) => (mode === "date" ? setDay(date) : setTime(date))}
        accentColorRaw={theme.primary}
        scheme={theme.background === "#000000" ? "dark" : "light"}
      />

      {mode === "time" && (
        <Pressable
          onPress={() => onTimeChange("")}
          style={styles.clearTimeRow}
          accessibilityLabel="Retirer l'heure"
        >
          <Ionicons name="close-circle-outline" size={16} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary">
            Retirer l'heure (toute la journée)
          </ThemedText>
        </Pressable>
      )}
    </ThemedView>
  );
}

/**
 * The wheel itself: expo-ui's cross-platform DateTimePicker on native
 * (Material wheel / SwiftUI wheel), a pair of <input type=date|time> on web
 * (compact, keyboard-free). Kept in this one file — the web fallback lives in
 * InlineDateTimePicker.web.tsx, see the platform-specific twin below.
 */
import NativeWheelPicker from "@/components/tasks/native-wheel-picker";

const styles = StyleSheet.create({
  collapsedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    flexWrap: "wrap",
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.half,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  timeTrigger: {},
  expanded: {
    borderRadius: Radius.md,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  expandedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  quickStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  quickDay: {
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  quickDayLabel: {
    fontSize: 12,
  },
  clearTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.half,
  },
});

export type { PickerMode, ThemeColor as _ThemeColor };

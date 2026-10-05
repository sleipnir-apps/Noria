import { RRule, type Weekday } from "rrule";
import type { RecurrenceRule, TaskWeekday } from "./task.schema";

const WEEKDAY_TO_RRULE: Record<TaskWeekday, Weekday> = {
  MO: RRule.MO,
  TU: RRule.TU,
  WE: RRule.WE,
  TH: RRule.TH,
  FR: RRule.FR,
  SA: RRule.SA,
  SU: RRule.SU,
};

/**
 * Parse a client-level recurrence rule into the rrule library options.
 *
 * Timezone policy: everything is composed in UTC and expanded with `tzid:
 * "UTC"` — a `by_weekday: ["MO"]` rule targets the UTC weekday of the task's
 * due_date, consistently on the server and on every client. Clients render
 * the returned instants in their local timezone.
 */
function toRRuleOptions(
  rule: RecurrenceRule,
  dueDate: Date
): ConstructorParameters<typeof RRule>[0] {
  const options: ConstructorParameters<typeof RRule>[0] = {
    freq: RRule[rule.frequency],
    interval: rule.interval,
    dtstart: dueDate,
    tzid: "UTC",
  };

  if (rule.by_weekday && rule.by_weekday.length > 0) {
    options.byweekday = rule.by_weekday.map((d) => WEEKDAY_TO_RRULE[d]);
  }
  if (rule.by_month_day !== undefined) {
    options.bymonthday = rule.by_month_day;
  }
  if (rule.end_date) {
    options.until = new Date(rule.end_date);
  }
  return options;
}

/**
 * Expand the occurrences of a recurring task inside `[rangeStart, rangeEnd]`.
 *
 * The series anchor is the parent's `due_date`: it always counts as the first
 * occurrence (even if it does not match the rule's weekday — the simplest,
 * documented policy). Later occurrences come from the rrule expansion, with
 * the parent's own instant de-duplicated. Results are sorted ascending and
 * expressed as UTC ISO strings.
 */
export function expandOccurrences(
  rule: RecurrenceRule,
  dueDate: string,
  rangeStart: string,
  rangeEnd: string
): string[] {
  const start = new Date(rangeStart);
  const end = new Date(rangeEnd);
  const due = new Date(dueDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || Number.isNaN(due.getTime()))
    return [];
  if (end < start) return [];

  const occurrences: string[] = [];

  // The parent's own due_date is the first occurrence of the series.
  if (due >= start && due <= end) {
    occurrences.push(due.toISOString());
  }

  // Rule expansion (dtstart included only when it matches the rule).
  const expanded = new RRule({
    ...toRRuleOptions(rule, due),
    dtstart: due,
  }).between(start, end, true);

  for (const date of expanded) {
    if (date.getTime() === due.getTime()) continue; // already added above
    const iso = date.toISOString();
    if (iso >= rangeStart && iso <= rangeEnd) occurrences.push(iso);
  }

  return occurrences.sort();
}

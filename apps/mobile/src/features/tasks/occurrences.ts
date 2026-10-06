import type { LocalTask } from "@/store/task.store";
import { RRule } from "rrule";
import type { RecurrenceRule } from "@template/contracts";

const FREQ_BY_RULE: Record<RecurrenceRule["frequency"], number> = {
  DAILY: RRule.DAILY,
  WEEKLY: RRule.WEEKLY,
  MONTHLY: RRule.MONTHLY,
  YEARLY: RRule.YEARLY,
};

export interface RecurrenceWindow {
  /** Inclusive. */
  start: Date;
  /** Exclusive. */
  end: Date;
}

/**
 * Occurrences of a rule inside [window.start, window.end), computed locally
 * with the same `rrule` semantics as the API (dtstart = the parent's due date,
 * window end exclusive). Works fully offline.
 */
export function expandOccurrences(
  rule: RecurrenceRule,
  sourceDate: Date,
  window: RecurrenceWindow
): Date[] {
  const rrule = new RRule({
    freq: FREQ_BY_RULE[rule.frequency],
    interval: rule.interval,
    ...(rule.byWeekday !== undefined ? { byweekday: rule.byWeekday } : {}),
    ...(rule.byMonthDay !== undefined ? { bymonthday: rule.byMonthDay } : {}),
    ...(rule.endDate !== undefined ? { until: new Date(rule.endDate) } : {}),
    dtstart: sourceDate,
  });

  const inWindow = rrule.between(window.start, window.end, true);
  return inWindow.filter((date) => date.getTime() < window.end.getTime());
}

/**
 * True when an instant of a recurring parent is already materialized by a
 * stored instance (same originalDueDate). The snapshot sent on push carries
 * the same information server-side, so both sides stay consistent.
 */
export function isMaterialized(
  tasks: Record<string, LocalTask>,
  parentTaskId: string,
  instant: Date
): boolean {
  const instantIso = instant.toISOString();
  for (const task of Object.values(tasks)) {
    if (task.parentTaskId === parentTaskId && task.originalDueDate === instantIso) {
      return true;
    }
  }
  return false;
}

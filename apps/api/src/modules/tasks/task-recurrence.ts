import { RRule } from "rrule";
import type { RecurrenceRule } from "@template/contracts";

export interface RecurrenceWindow {
  /** Inclusive. */
  start: Date;
  /** Exclusive. */
  end: Date;
}

const FREQ_BY_RULE: Record<RecurrenceRule["frequency"], number> = {
  DAILY: RRule.DAILY,
  WEEKLY: RRule.WEEKLY,
  MONTHLY: RRule.MONTHLY,
  YEARLY: RRule.YEARLY,
};

/**
 * Occurrences of a rule inside [window.start, window.end), computed with the
 * `rrule` lib. The rule's own `endDate` (inclusive last instant) is applied by
 * the constructor; the window end is exclusive.
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

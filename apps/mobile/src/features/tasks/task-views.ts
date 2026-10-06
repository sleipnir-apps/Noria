import type { LocalTask } from "@/store/task.store";
import { expandOccurrences, isMaterialized } from "@/features/tasks/occurrences";
import { MS_PER_DAY, localDayKey, todayWindow } from "@/features/tasks/local-date";

/**
 * All views work on the local dataset (works offline). Occurrences are
 * computed here with the same rrule semantics as the API, and materialized
 * instances replace the underlying occurrence (like GET /tasks/range).
 */

/** "Absent or null" means "not set" (the dataset may carry BSON-null copy). */
function isSet<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null;
}

/** Priority sort: P1 first. */
const PRIORITY_ORDER: Record<LocalTask["priority"], number> = { P1: 0, P2: 1, P3: 2, P4: 3 };

/** An entry of a task list: a stored task or a computed occurrence. */
export interface TaskItem {
  /** Stable React key. */
  key: string;
  /** Store id for stored tasks, synthetic id for occurrences. */
  id: string;
  isOccurrence: boolean;
  /** Occurrence only: parent id + computed instant (ISO, matching originalDueDate). */
  parentTaskId?: string;
  originalDueDate?: string;
  /** The document to display: the task, the instance, or the parent (occurrences). */
  task: LocalTask;
}

export interface TodaySections {
  /** Open tasks dated today (instances included, recurring parents excluded). */
  datedToday: TaskItem[];
  /** Computed occurrences of today not yet materialized. */
  occurrencesToday: TaskItem[];
  /** Late dated tasks + last missed occurrence of each recurring parent. */
  overdue: TaskItem[];
}

const sortRangeItems = (a: TaskItem, b: TaskItem): number => {
  const dueDiff = (b.task.dueDate ?? "").localeCompare(a.task.dueDate ?? "");
  if (dueDiff !== 0) return dueDiff;
  const priorityDiff = PRIORITY_ORDER[a.task.priority] - PRIORITY_ORDER[b.task.priority];
  if (priorityDiff !== 0) return priorityDiff;
  return a.task.createdAt.localeCompare(b.task.createdAt);
};

const itemFromTask = (task: LocalTask): TaskItem => ({
  key: task.id,
  id: task.id,
  isOccurrence: false,
  task,
});

/** Mirror of the server's toOccurrenceDto: parent fields, occurrence id/status. */
function occurrenceToItem(parent: LocalTask, instant: Date): TaskItem {
  const instantIso = instant.toISOString();
  const key = `occ:${parent.id}:${instantIso}`;
  return {
    key,
    id: key,
    isOccurrence: true,
    parentTaskId: parent.id,
    originalDueDate: instantIso,
    task: {
      ...parent,
      id: key,
      status: "TODO",
      dueDate: instantIso,
      recurrenceRule: undefined,
      parentTaskId: parent.id,
      originalDueDate: instantIso,
    },
  };
}

/** True when a document is the recurring source (never displayed directly). */
function isRecurringParent(task: LocalTask): boolean {
  return task.recurrenceRule !== undefined && task.parentTaskId === undefined;
}

const isOpen = (task: LocalTask): boolean =>
  task.status === "TODO" || task.status === "IN_PROGRESS";

/** Computed occurrences of a parent inside a window, minus materialized ones. */
export function occurrencesInWindow(
  tasks: Record<string, LocalTask>,
  parent: LocalTask,
  window: { start: Date; end: Date }
): TaskItem[] {
  if (!isSet(parent.dueDate) || !parent.recurrenceRule) return [];
  const instants = expandOccurrences(parent.recurrenceRule, new Date(parent.dueDate), window);
  return instants
    .filter((instant) => !isMaterialized(tasks, parent.id, instant))
    .map((instant) => occurrenceToItem(parent, instant));
}

export function computeTodaySections(tasks: Record<string, LocalTask>, now: Date): TodaySections {
  const { start, end } = todayWindow(now);
  const nowMs = now.getTime();

  const datedToday: TaskItem[] = [];
  const occurrencesToday: TaskItem[] = [];
  const overdue: TaskItem[] = [];

  for (const task of Object.values(tasks)) {
    if (task.deletedAt !== undefined || task.status === "ARCHIVED") continue;
    const recurringParent = isRecurringParent(task);

    if (recurringParent) {
      if (!isSet(task.dueDate)) continue;
      // Occurrences of today.
      occurrencesToday.push(...occurrencesInWindow(tasks, task, { start, end }));
      // Last missed occurrence (before now).
      const missed = expandOccurrences(task.recurrenceRule!, new Date(task.dueDate!), {
        start: new Date(task.dueDate!),
        end: now,
      }).filter((instant) => !isMaterialized(tasks, task.id, instant));
      const latestMissed = missed[missed.length - 1];
      if (latestMissed) overdue.push(occurrenceToItem(task, latestMissed));
      continue;
    }

    if (task.parentTaskId !== undefined && !isSet(task.dueDate)) continue;

    if (task.status === "DONE") continue;

    if (task.dueDate === undefined) {
      // Backlog — not part of "today".
      continue;
    }

    const dueMs = new Date(task.dueDate).getTime();
    if (dueMs >= start.getTime() && dueMs < end.getTime()) {
      datedToday.push(itemFromTask(task));
    } else if (dueMs < nowMs) {
      overdue.push(itemFromTask(task));
    }
  }

  datedToday.sort(sortRangeItems);
  occurrencesToday.sort(sortRangeItems);
  overdue.sort(sortRangeItems);
  return { datedToday, occurrencesToday, overdue };
}

/** Backlog: dateless open tasks, sorted by priority then creation date. */
export function computeBacklog(tasks: Record<string, LocalTask>): TaskItem[] {
  const backlog = Object.values(tasks).filter(
    (task) =>
      task.deletedAt === undefined &&
      task.dueDate === undefined &&
      task.recurrenceRule === undefined &&
      isOpen(task)
  );
  return backlog
    .sort((a, b) => {
      const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.createdAt.localeCompare(b.createdAt);
    })
    .map(itemFromTask);
}

/** Name of the "À venir" tab: default window length in days (API max is 60). */
export const UPCOMING_DAYS = 14;

export interface UpcomingDayGroup {
  /** Local calendar day key "YYYY-MM-DD". */
  date: string;
  items: TaskItem[];
}

/**
 * Day groups of the "À venir" tab: dated open tasks and occurrences of the
 * next `days` local days (excluding materialized ones), grouped by local
 * calendar day — empty days never produce a group. Groups are sorted
 * chronologically, items keep the shared range sort inside a day.
 */
export function computeUpcomingGroups(
  tasks: Record<string, LocalTask>,
  now: Date,
  days: number = UPCOMING_DAYS
): UpcomingDayGroup[] {
  const start = todayWindow(now).start;
  const end = new Date(start.getTime() + days * MS_PER_DAY);

  const byDate = new Map<string, TaskItem[]>();
  const groupOf = (date: string): TaskItem[] => {
    const existing = byDate.get(date);
    if (existing !== undefined) return existing;
    const created: TaskItem[] = [];
    byDate.set(date, created);
    return created;
  };

  for (const task of Object.values(tasks)) {
    if (task.deletedAt !== undefined || task.status === "ARCHIVED") continue;

    if (isRecurringParent(task)) {
      for (const occurrence of occurrencesInWindow(tasks, task, { start, end })) {
        groupOf(localDayKey(occurrence.originalDueDate!)).push(occurrence);
      }
      continue;
    }

    if (task.status === "DONE" || !isSet(task.dueDate)) continue;

    const dueMs = new Date(task.dueDate).getTime();
    if (dueMs < start.getTime() || dueMs >= end.getTime()) continue;

    groupOf(localDayKey(task.dueDate)).push(itemFromTask(task));
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({ date, items: items.sort(sortRangeItems) }));
}

/** Weekday short label keyed by the rrule convention (0 = Monday … 6 = Sunday). */
export const weekdayLabels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"] as const;

export const weekdayLabel = (index: number): string => weekdayLabels[index] ?? "";

/** Summary text of a rule ("Chaque semaine (Lun, Mer)"). */
export function recurrenceSummary(rule: NonNullable<LocalTask["recurrenceRule"]>): string {
  if (rule.frequency === "WEEKLY" && rule.byWeekday !== undefined && rule.byWeekday.length > 0) {
    return `Chaque semaine (${rule.byWeekday.map(weekdayLabel).join(", ")})`;
  }
  const labelByFrequency: Record<NonNullable<LocalTask["recurrenceRule"]>["frequency"], string> = {
    DAILY: "Chaque jour",
    WEEKLY: "Chaque semaine",
    MONTHLY: "Chaque mois",
    YEARLY: "Chaque année",
  };
  return labelByFrequency[rule.frequency];
}

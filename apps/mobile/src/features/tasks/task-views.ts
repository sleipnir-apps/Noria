import type { LocalTask } from "@/store/task.store";
import { expandOccurrences, isMaterialized } from "@/features/tasks/occurrences";
import { todayWindow } from "@/features/tasks/local-date";

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

/** One day of the "À venir" view: local calendar key + its items. */
export interface UpcomingGroup {
  /** "YYYY-MM-DD" (device calendar). */
  date: string;
  items: TaskItem[];
}

/**
 * "À venir": every open dated task + every computed occurrence whose
 * instant falls in [today's local midnight, today + days), grouped by local
 * calendar day and sorted chronologically. Days without anything are
 * skipped (no empty group is rendered), like the API's upcoming view.
 * DONE instances are kept (they show today's completion) but DONE dated
 * one-offs are not upcoming anymore. Nothing else is excluded: this works
 * fully offline on the local dataset, same rrule semantics as the API.
 */
export function computeUpcomingGroups(
  tasks: Record<string, LocalTask>,
  now: Date,
  days = 14
): UpcomingGroup[] {
  const windowEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);

  const byDay = new Map<string, TaskItem[]>();

  for (const task of Object.values(tasks)) {
    if (task.deletedAt !== undefined) continue;
    if (task.status === "ARCHIVED") continue;
    const recurringParent = isRecurringParent(task);
    const isInstance = task.parentTaskId !== undefined;

    if (recurringParent) continue; // occurrences are expanded below, the raw parent never shows

    if (isInstance) {
      // Instance: shown when its SOURCE occurrence instant is in window
      // (originalDueDate), even if postponed (its own dueDate may differ).
      // TODO/IN_PROGRESS/DONE all show (state of the day).
      const source = task.originalDueDate ?? task.dueDate;
      if (source === undefined) continue;
      const at = new Date(source).getTime();
      if (at >= windowEnd.getTime() || at < now.getTime() - 24 * 3600 * 1000) continue;
      // belongs to the day of the source instant
      const key = localDayKeyOf(new Date(source));
      if (at >= localMidnight(now).getTime())
        push(byDay, key, {
          key: task.id,
          id: task.id,
          isOccurrence: false,
          task,
        });
      continue;
    }

    if (task.status === "DONE") continue; // dated one-off already completed
    if (task.dueDate === undefined) continue; // backlog

    const at = new Date(task.dueDate).getTime();
    if (at < localMidnight(now).getTime() || at >= windowEnd.getTime()) continue;
    push(byDay, localDayKeyOf(new Date(task.dueDate)), itemFromTask(task));
  }

  // Virtual occurrences of recurring parents (not yet materialized).
  for (const parent of Object.values(tasks)) {
    if (parent.deletedAt !== undefined || !isRecurringParent(parent)) continue;
    if (!isSet(parent.dueDate)) continue;
    for (const item of occurrencesInWindow(tasks, parent, {
      start: localMidnight(now),
      end: windowEnd,
    })) {
      push(byDay, localDayKeyOf(new Date(item.originalDueDate!)), item);
    }
  }

  return [...byDay.keys()].sort().map((date) => ({
    date,
    items: (byDay.get(date) ?? []).sort((a, b) =>
      (a.task.dueDate ?? "").localeCompare(b.task.dueDate ?? "")
    ),
  }));
}

// ── Internal helpers of the upcoming view ────────────────────────────────────

const pad2 = (value: number): string => String(value).padStart(2, "0");

/** Local calendar day key of a Date on this device. */
function localDayKeyOf(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Local midnight instant of `now`'s calendar day. */
function localMidnight(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function push(map: Map<string, TaskItem[]>, key: string, item: TaskItem): void {
  const bucket = map.get(key);
  if (bucket) {
    bucket.push(item);
  } else {
    map.set(key, [item]);
  }
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

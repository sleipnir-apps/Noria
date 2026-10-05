/**
 * Client-side views over the local task cache (offline-first).
 * Pure functions over TaskDto[] — no server knowledge.
 */
import { expandOccurrences } from "@template/contracts";
import type { TaskDto } from "@template/contracts";

/** Live (not deleted, not archived) tasks relevant to the main views. */
function live(tasks: TaskDto[]): TaskDto[] {
  return tasks.filter((t) => !t.deleted_at && t.status !== "ARCHIVED");
}

/** Backlog: tasks WITHOUT due_date, sorted priority then created_at. */
export function selectBacklog(tasks: TaskDto[]): TaskDto[] {
  const rank: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };
  return live(tasks)
    .filter((t) => !t.due_date)
    .sort((a, b) => {
      const byPriority = (rank[a.priority ?? "P3"] ?? 2) - (rank[b.priority ?? "P3"] ?? 2);
      if (byPriority !== 0) return byPriority;
      return (a.created_at ?? a.updated_at).localeCompare(b.created_at ?? b.updated_at);
    });
}

export interface TodaySections {
  /** Dated tasks (non-recurring) whose due_date is within the given day. */
  dated: TaskDto[];
  /** Recurring occurrences falling on the day (virtual + instances). */
  occurrences: TaskDto[];
  /** Past undone dated tasks (any day before `day`). */
  overdue: TaskDto[];
}

/** Day boundaries in local time (the device timezone is the UI truth). */
function dayBounds(day: Date): { start: string; end: string } {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(day);
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

function sameLocalDay(iso: string, day: Date): boolean {
  const date = new Date(iso);
  return (
    date.getFullYear() === day.getFullYear() &&
    date.getMonth() === day.getMonth() &&
    date.getDate() === day.getDate()
  );
}

/**
 * "Aujourd'hui" view: dated tasks of the day, occurrences of the day
 * (rrule-expanded from recurring parents), and everything overdue.
 */
export function selectToday(tasks: TaskDto[], now: Date = new Date()): TodaySections {
  const { start, end } = dayBounds(now);
  const result: TodaySections = { dated: [], occurrences: [], overdue: [] };

  for (const task of live(tasks)) {
    if (task.parent_task_id) {
      // Materialized instance: belongs to the day of its instant.
      const instant = task.due_date ?? task.original_due_date;
      if (instant && sameLocalDay(instant, now)) result.occurrences.push(task);
      continue;
    }

    if (!task.due_date) continue;

    if (task.due_date < start) {
      // Overdue: past and not done (archived already filtered out).
      if (task.status !== "DONE") {
        result.overdue.push(task);
      }
      continue;
    }

    if (sameLocalDay(task.due_date, now)) {
      result.dated.push(task);
    }
  }

  // Expand recurring parents whose series is active around the day.
  for (const task of live(tasks)) {
    if (task.parent_task_id || !task.due_date || !task.recurrence_rule) continue;
    // Materialized instances already carry their occurrence date (handled
    // above); skip virtuals already covered by `dated` (first occurrence).
    const occurrences = expandOccurrences(task.recurrence_rule, task.due_date, start, end);
    for (const occurrence of occurrences) {
      const hasInstance = tasks.some(
        (t) =>
          t.parent_task_id === task.id &&
          (t.original_due_date === occurrence || t.due_date === occurrence)
      );
      if (hasInstance) continue;
      if (occurrence === task.due_date) continue; // parent's first occurrence, in `dated`
      result.occurrences.push({
        ...task,
        is_occurrence: true,
        occurrence_date: occurrence,
        due_date: occurrence,
        id: `${task.id}@${occurrence}`, // synthetic key for React lists
      });
    }
  }

  result.dated.sort(byDueDate);
  result.occurrences.sort(byDueDate);
  result.overdue.sort(byDueDate);
  return result;
}

function byDueDate(a: TaskDto, b: TaskDto): number {
  return (a.due_date ?? "").localeCompare(b.due_date ?? "");
}

import type { Task } from "@template/contracts";

/**
 * Upcoming-view builder, pure and calendar-agnostic: given a flat list of
 * tasks inside [windowStart, windowEnd) (already fused with computed
 * occurrences, like getRange), group them by LOCAL calendar day.
 *
 * Grouping uses the server timezone — the API has no notion of the client's
 * device timezone in a GET (no payload to carry an offset), so "today" is the
 * server's local calendar. On a same-host dev setup (API + web) the two
 * calendars agree; the front additionally groups ITS own dataset locally, so
 * this endpoint is primarily a server-side mirror for external consumers
 * (curl, CI checks). Documented in the mission README.
 */

const pad = (value: number): string => String(value).padStart(2, "0");

/** Local calendar day key "YYYY-MM-DD" of an instant (server timezone). */
export function serverDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export interface UpcomingWindow {
  /** Inclusive instant (usually today, local midnight). */
  start: Date;
  /** Exclusive instant (start + days × 24h). */
  end: Date;
}

/**
 * [start, end) window for an "upcoming" view of `days` calendar days.
 * Anchored on the local calendar (DST-safe: each day boundary is built from
 * the local calendar itself, not from a fixed 24h roll-up).
 */
export function upcomingWindow(now: Date, days: number): UpcomingWindow {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  return { start, end };
}

/** Group a list of range-items by local calendar day, sorted chronologically. */
export function groupByLocalDay(items: Task[]): Array<{ date: string; tasks: Task[] }> {
  const byDay = new Map<string, Task[]>();
  for (const task of items) {
    if (task.dueDate === undefined) continue;
    const key = serverDayKey(new Date(task.dueDate));
    const bucket = byDay.get(key);
    if (bucket) {
      bucket.push(task);
    } else {
      byDay.set(key, [task]);
    }
  }
  const days = [...byDay.keys()].sort();
  return days.map((date) => {
    const tasks = byDay.get(date)!;
    tasks.sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
    return { date, tasks };
  });
}

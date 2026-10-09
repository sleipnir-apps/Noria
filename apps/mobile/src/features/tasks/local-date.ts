const pad = (value: number): string => String(value).padStart(2, "0");

/** Local timezone offset of a date, formatted "+HH:MM" / "-HH:MM". */
export function localOffset(date: Date): string {
  const totalMinutes = -date.getTimezoneOffset();
  const sign = totalMinutes >= 0 ? "+" : "-";
  const minutes = Math.abs(totalMinutes);
  return `${sign}${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/**
 * ISO instant of local midnight for a calendar day. Date-only due dates anchor
 * there, so "tomorrow" and the day windows always align with the device
 * calendar (see README: DST caveat).
 */
export function localMidnightIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T00:00:00${localOffset(date)}`;
}

/** Local calendar day key "YYYY-MM-DD" of an ISO instant, on this device. */
export function localDayKey(iso: string): string {
  return localDateText(new Date(iso));
}

/** [start, end) window of a local calendar day. */
export function dayWindow(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return { start, end };
}

/** Today (device clock) as [start of day, start of next day), local calendar. */
export function todayWindow(now: Date = new Date()): { start: Date; end: Date } {
  return dayWindow(now);
}

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Parse a local "YYYY-MM-DD" day key as local noon (DST-safe). Parsing with
 * `new Date("YYYY-MM-DD")` would anchor on UTC midnight and shift the whole
 * calendar day in non-UTC timezones — never do that.
 */
export function parseLocalDayKey(dateKey: string): Date | null {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return null;
  const date = new Date(year, month - 1, day, 12);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Group header for a day key: "Aujourd'hui", "Demain", else "jeu. 15 janv.". */
export function relativeDayLabel(dateKey: string, now: Date): string {
  const target = parseLocalDayKey(dateKey);
  if (target === null) return dateKey;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const diffDays = Math.round((target.getTime() - today.getTime()) / MS_PER_DAY);
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Demain";
  return formatChipDate(target.toISOString());
}

/** "YYYY-MM-DD" text of a local calendar day (form input format). */
export function localDateText(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export interface ParsedDateTime {
  iso: string;
  hasTime: boolean;
}

/**
 * Build dueDate (ISO with local offset) + hasTime from form inputs.
 * Returns null on unparsable input — the form keeps Zod in charge of messages.
 */
export function parseDueDateInput(
  dateText: string,
  timeText: string | undefined
): ParsedDateTime | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText.trim());
  if (!dateMatch) return null;
  const [, year, month, day] = dateMatch;

  if (timeText === undefined || timeText.trim() === "") {
    return { iso: `${year}-${month}-${day}T00:00:00${localOffset(new Date())}`, hasTime: false };
  }

  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeText.trim());
  if (!timeMatch) return null;
  return {
    iso: `${year}-${month}-${day}T${timeMatch[1]}:${timeMatch[2]}:00${localOffset(new Date())}`,
    hasTime: true,
  };
}

/** Short fr label for a date chip: "lun. 12 janv.". */
export function formatChipDate(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

/** "HH:MM" of an instant on this device, or the weekday+time fallback header. */
export function formatChipTime(iso: string): string {
  const date = new Date(iso);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Long day label for the Aujourd'hui header: "lundi 5 janvier". */
export function formatLongDay(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

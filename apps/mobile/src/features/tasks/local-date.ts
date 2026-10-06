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
export function localDayKey(iso: string, reference: Date = new Date(iso)): string {
  return `${reference.getFullYear()}-${pad(reference.getMonth() + 1)}-${pad(reference.getDate())}`;
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

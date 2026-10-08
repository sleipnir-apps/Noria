import { localDateText } from "@/features/tasks/local-date";

/**
 * Pure month-grid model of the date-picker sheet: 6 uniform weeks of 7 days,
 * Monday-first (rrule convention: Monday = 0), with neighboring-month days
 * kept in place (the UI dims them, tapping still selects). No react-native
 * import — testable directly with bun:test.
 */

export interface CalendarDayCell {
  /** The represented day as "YYYY-MM-DD" (local calendar). */
  localDateText: string;
  dayOfMonth: number;
  /** Belongs to the displayed month (false = dimmed adjacent month)? */
  inMonth: boolean;
}

const CELLS_PER_GRID = 42; // 6 weeks × 7 days — uniform grid, no ragged rows

/** Month grid of the cursor's month as 6 rows of 7 cells. */
export function buildMonthGrid(cursor: Date): CalendarDayCell[][] {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  // Monday-first column offset (rrule convention: Monday = 0 … Sunday = 6).
  const leadingDays = (firstOfMonth.getDay() + 6) % 7;

  const cells: CalendarDayCell[] = [];
  for (let index = 0; index < CELLS_PER_GRID; index += 1) {
    // Day 0 and negative values roll over to the adjacent months.
    const date = new Date(year, month, 1 - leadingDays + index);
    cells.push({
      localDateText: localDateText(date),
      dayOfMonth: date.getDate(),
      inMonth: date.getMonth() === month,
    });
  }
  // Chunk into 6 stable rows (some month shapes need the 6th row).
  const weeks: CalendarDayCell[][] = [];
  for (let row = 0; row < CELLS_PER_GRID; row += 7) {
    weeks.push(cells.slice(row, row + 7));
  }
  return weeks;
}

/** Month caption "janvier 2026" for the sheet header. */
export function monthTitle(cursor: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(cursor);
}

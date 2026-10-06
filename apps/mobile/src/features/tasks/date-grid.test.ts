import { describe, expect, it } from "bun:test";
import { buildMonthGrid, monthTitle } from "@/features/tasks/date-grid";

/**
 * Pure model of the date-picker calendar. Fixed local dates (January 2026:
 * the 1st is a Thursday, the month keeps 4 full weeks) so expectations are
 * timezone-independent — every value is computed in the local calendar.
 */

const JANUARY_2026 = new Date(2026, 0, 1); // jeudi → 3 jours de décembre en tête
const FEBRUARY_2026 = new Date(2026, 1, 1); // dimanche → 6 jours de janvier en tête

describe("buildMonthGrid", () => {
  it("aligne janvier 2026 jeudi premier et le termine le février 1", () => {
    const weeks = buildMonthGrid(JANUARY_2026);

    expect(weeks.length).toBe(6);
    expect(weeks.every((week) => week.length === 7)).toBe(true);

    // Les jours du mois précédent restent en place (grille uniforme).
    expect(weeks[0]?.slice(0, 3).map((cell) => cell.localDateText)).toEqual([
      "2025-12-29",
      "2025-12-30",
      "2025-12-31",
    ]);
    expect(weeks[0]?.slice(0, 3).every((cell) => !cell.inMonth)).toBe(true);

    expect(weeks[0]?.[3]).toEqual({
      localDateText: "2026-01-01",
      dayOfMonth: 1,
      inMonth: true,
    });

    // Janvier finit le samedi 31 (5e semaine, colonne Sam)…
    expect(weeks[4]?.[5]).toMatchObject({ dayOfMonth: 31, inMonth: true });
    // …et la grille passe le mois jusqu'au dimanche 8 février.
    expect(weeks[5]?.[6]).toMatchObject({ localDateText: "2026-02-08", inMonth: false });
  });

  it("aligne février 2026 (6 jours de janvier en tête, 4 semaines pleines)", () => {
    const weeks = buildMonthGrid(FEBRUARY_2026);

    // Le 1er février est un dimanche : la grille lundi-d'abord commence
    // par les 26–31 janvier, grisé.
    expect(weeks[0]?.slice(0, 6).every((cell) => !cell.inMonth)).toBe(true);
    expect(weeks[0]?.[6]).toMatchObject({ localDateText: "2026-02-01", inMonth: true });

    const flat = weeks.flat();
    expect(flat.filter((cell) => cell.inMonth).length).toBe(28);
    expect(flat[33]?.localDateText).toBe("2026-02-28");
  });

  it("titule le mois en français", () => {
    expect(monthTitle(JANUARY_2026)).toBe("janvier 2026");
    expect(monthTitle(FEBRUARY_2026)).toBe("février 2026");
  });
});

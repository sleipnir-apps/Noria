import { describe, expect, it } from "bun:test";
import { expandOccurrences } from "../index";

describe("expandOccurrences", () => {
  it("expands a weekly MO rule across 4 Mondays of a month", () => {
    // October 2026: Mondays 5, 12, 19, 26.
    const occurrences = expandOccurrences(
      { frequency: "WEEKLY", interval: 1, by_weekday: ["MO"] },
      "2026-10-05T09:00:00.000Z",
      "2026-10-01T00:00:00.000Z",
      "2026-10-31T23:59:59.999Z"
    );
    expect(occurrences).toHaveLength(4);
    expect(occurrences[0]).toBe("2026-10-05T09:00:00.000Z");
    expect(occurrences[3]).toBe("2026-10-26T09:00:00.000Z");
  });

  it("includes the parent due_date itself as first occurrence", () => {
    const occurrences = expandOccurrences(
      { frequency: "DAILY", interval: 1 },
      "2026-11-02T08:00:00.000Z",
      "2026-11-02T00:00:00.000Z",
      "2026-11-02T23:59:59.999Z"
    );
    expect(occurrences).toEqual(["2026-11-02T08:00:00.000Z"]);
  });

  it("respects end_date (until)", () => {
    const occurrences = expandOccurrences(
      { frequency: "DAILY", interval: 1, end_date: "2026-11-04T23:59:59.999Z" },
      "2026-11-01T08:00:00.000Z",
      "2026-11-01T00:00:00.000Z",
      "2026-11-10T00:00:00.000Z"
    );
    expect(occurrences).toHaveLength(4); // 1, 2, 3, 4
    expect(occurrences[3]).toBe("2026-11-04T08:00:00.000Z");
  });

  it("monthly by_month_day skips months without the day", () => {
    const occurrences = expandOccurrences(
      { frequency: "MONTHLY", interval: 1, by_month_day: 31 },
      "2026-01-31T09:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
      "2026-04-30T23:59:59.999Z"
    );
    // January + March 2026 have 31 days, February and April do not.
    expect(occurrences).toEqual(["2026-01-31T09:00:00.000Z", "2026-03-31T09:00:00.000Z"]);
  });

  it("returns empty outside the range", () => {
    const occurrences = expandOccurrences(
      { frequency: "YEARLY", interval: 1 },
      "2027-01-01T00:00:00.000Z",
      "2026-10-01T00:00:00.000Z",
      "2026-10-31T00:00:00.000Z"
    );
    expect(occurrences).toEqual([]);
  });
});

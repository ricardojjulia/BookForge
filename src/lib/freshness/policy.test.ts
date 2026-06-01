import { describe, expect, it } from "vitest";
import { evaluateFreshness, formatAge } from "@/lib/freshness/policy";

describe("evaluateFreshness", () => {
  const asOf = new Date("2026-06-01T12:00:00.000Z");

  it("returns fresh before stale threshold", () => {
    const fetchedAt = new Date("2026-06-01T10:00:00.000Z");

    const result = evaluateFreshness({ asOf, fetchedAt });

    expect(result.status).toBe("fresh");
    expect(result.ageHours).toBeCloseTo(2, 3);
  });

  it("returns stale once stale threshold is reached", () => {
    const fetchedAt = new Date("2026-05-31T12:00:00.000Z");

    const result = evaluateFreshness({
      asOf,
      fetchedAt,
      policy: { staleAfterHours: 24, forceAfterHours: 48 },
    });

    expect(result.status).toBe("stale");
    expect(result.ageHours).toBeCloseTo(24, 3);
  });

  it("returns expired once force threshold is reached", () => {
    const fetchedAt = new Date("2026-05-30T12:00:00.000Z");

    const result = evaluateFreshness({
      asOf,
      fetchedAt,
      policy: { staleAfterHours: 24, forceAfterHours: 48 },
    });

    expect(result.status).toBe("expired");
    expect(result.ageHours).toBeCloseTo(48, 3);
  });

  it("clamps negative age to zero", () => {
    const fetchedAt = new Date("2026-06-02T12:00:00.000Z");

    const result = evaluateFreshness({ asOf, fetchedAt });

    expect(result.ageMs).toBe(0);
    expect(result.ageHours).toBe(0);
    expect(result.status).toBe("fresh");
  });
});

describe("formatAge", () => {
  it("formats seconds, minutes, hours, and days", () => {
    expect(formatAge(30_000)).toBe("30s");
    expect(formatAge(5 * 60_000)).toBe("5m");
    expect(formatAge(3 * 60 * 60_000)).toBe("3h");
    expect(formatAge(3 * 24 * 60 * 60_000)).toBe("3d");
  });
});

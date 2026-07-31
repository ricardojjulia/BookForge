import { describe, expect, it, vi } from "vitest";
import { isStaleRunningJob, summarizeRevisionJobs } from "./job-state";

describe("summarizeRevisionJobs", () => {
  it("counts active, stale, and terminal jobs", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T12:00:00Z"));

    const summary = summarizeRevisionJobs([
      {
        status: "running",
        settings: {
          progress: {
            lastHeartbeatAt: "2026-06-02T11:56:00Z",
          },
        },
      },
      {
        status: "queued",
        settings: {},
      },
      {
        status: "paused",
        settings: {},
      },
      {
        status: "completed",
        settings: {},
      },
      {
        status: "failed",
        settings: {},
      },
      {
        status: "cancelled",
        settings: {},
      },
    ]);

    expect(summary).toEqual({
      total: 6,
      active: 3,
      running: 1,
      queued: 1,
      paused: 1,
      completed: 1,
      failed: 1,
      cancelled: 1,
      staleRunning: 1,
    });

    vi.useRealTimers();
  });

  it("ignores non-running jobs when checking staleness", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T12:00:00Z"));

    expect(
      isStaleRunningJob("paused", {
        taskName: "Rewrite",
        currentUnit: "Chapter 1",
        totalUnits: 1,
        attempted: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        lastHeartbeatAt: "2026-06-02T11:00:00Z",
      }),
    ).toBe(false);

    vi.useRealTimers();
  });
});

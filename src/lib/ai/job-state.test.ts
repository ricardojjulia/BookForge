import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createRevisionJobHeartbeat, isStaleRunningJob, summarizeRevisionJobs } from "./job-state";

function createMockSupabase() {
  const writes: unknown[] = [];
  const client = {
    from: () => ({
      update: (payload: { settings: unknown }) => ({
        eq: async () => {
          writes.push(payload.settings);
          return { error: null };
        },
      }),
    }),
  } as unknown as SupabaseClient;
  return { writes, client };
}

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

describe("createRevisionJobHeartbeat", () => {
  it("preserves taskName and startedAt from the job's existing settings on its first tick", async () => {
    // Reproduces a live bug: this is recreated fresh for every unit in a
    // batch (e.g. once per chapter in generate-draft), seeded each time with
    // only a small per-unit patch (currentUnit/attempted/successful). If its
    // first tick doesn't merge that patch with the job's REAL existing
    // progress first, it silently resets taskName to the generic "AI task"
    // default and startedAt to null the first time the background interval
    // fires -- found live as the job's displayed name and elapsed time
    // flickering between correct and reset every ~30s during a real run.
    const { writes, client } = createMockSupabase();
    const existingSettings = {
      progress: {
        taskName: "Creation Draft Generation",
        currentUnit: "Chapter 1: The Setup",
        totalUnits: 3,
        attempted: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        startedAt: "2026-08-11T02:44:35.000Z",
        lastHeartbeatAt: "2026-08-11T02:44:35.000Z",
      },
    };

    const heartbeat = createRevisionJobHeartbeat(client, "job-1", existingSettings, {
      currentUnit: "Chapter 2: The Doubt",
      attempted: 1,
      successful: 1,
      totalUnits: 3,
    });

    await heartbeat.touch();
    heartbeat.stop();

    expect(writes).toHaveLength(1);
    const written = writes[0] as { progress: { taskName: string; startedAt: string | null; currentUnit: string } };
    expect(written.progress.taskName).toBe("Creation Draft Generation");
    expect(written.progress.startedAt).toBe("2026-08-11T02:44:35.000Z");
    expect(written.progress.currentUnit).toBe("Chapter 2: The Doubt");
  });
});

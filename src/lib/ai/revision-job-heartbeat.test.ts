import { describe, expect, it, vi } from "vitest";
import { createRevisionJobHeartbeat } from "./job-state";

describe("createRevisionJobHeartbeat", () => {
  it("writes settings immediately and on interval until stopped", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T12:00:00Z"));

    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn(() => ({ update }));
    const supabase = { from } as unknown as {
      from: typeof from;
    };

    const heartbeat = createRevisionJobHeartbeat(
      supabase as never,
      "job-1",
      {
        progress: {
          taskName: "Draft generation",
          currentUnit: "Chapter 1",
          totalUnits: 1,
          attempted: 0,
          successful: 0,
          failed: 0,
          skipped: 0,
        },
      },
      {
        currentUnit: "Chapter 1",
        totalUnits: 1,
        attempted: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
      },
      1000,
    );

    await heartbeat.touch();
    expect(from).toHaveBeenCalledWith("revision_jobs");
    expect(update).toHaveBeenCalledTimes(1);
    expect(eq).toHaveBeenCalledWith("id", "job-1");

    await vi.advanceTimersByTimeAsync(1000);
    expect(update).toHaveBeenCalledTimes(2);

    heartbeat.stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(update).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});

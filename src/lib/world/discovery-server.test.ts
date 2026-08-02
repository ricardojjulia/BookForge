import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { persistWorldDiscovery } from "@/lib/world/discovery-server";

describe("persistWorldDiscovery", () => {
  it("inserts only missing entities and stamps AI provenance", async () => {
    const existing: Record<string, Record<string, unknown>[]> = {
      characters: [{ name: "Mara", source: "manual" }],
      locations: [],
      themes: [],
      motifs: [],
      timeline_notes: [],
    };
    const inserted: Record<string, Record<string, unknown>[]> = {};
    const from = vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(async () => ({ data: existing[table] || [], error: null })),
      })),
      insert: vi.fn(async (rows: Record<string, unknown>[]) => {
        inserted[table] = rows;
        return { error: null };
      }),
    }));

    const result = await persistWorldDiscovery({
      supabase: { from } as unknown as SupabaseClient,
      bookId: "book-1",
      jobId: "job-1",
      blueprint: {
        characters: ["Mara", "Jon"],
        locations: ["North Harbor"],
        majorThemes: ["Grace"],
        recurringMotifs: ["Open doors"],
        timeline: ["Mara arrives"],
      },
      chapters: [],
    });

    expect(result.inserted).toEqual({ characters: 1, locations: 1, themes: 1, motifs: 1, timeline: 1 });
    expect(result.skipped.characters).toBe(1);
    expect(inserted.characters).toEqual([
      expect.objectContaining({
        name: "Jon",
        book_id: "book-1",
        source: "ai_discovered",
        discovery_job_id: "job-1",
      }),
    ]);
    expect(inserted.characters[0]).not.toHaveProperty("name", "Mara");
  });

  it("surfaces a failed entity batch so the job can be marked failed", async () => {
    const from = vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(async () => ({ data: [], error: null })),
      })),
      insert: vi.fn(async () => ({ error: table === "locations" ? new Error("location write failed") : null })),
    }));

    await expect(persistWorldDiscovery({
      supabase: { from } as unknown as SupabaseClient,
      bookId: "book-1",
      jobId: "job-1",
      blueprint: { characters: ["Mara"], locations: ["North Harbor"] },
      chapters: [],
    })).rejects.toThrow("location write failed");
  });
});

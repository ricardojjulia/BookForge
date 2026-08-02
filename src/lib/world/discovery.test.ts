import { describe, expect, it } from "vitest";
import { buildWorldDiscoveryPlan, type ExistingWorldEntities } from "@/lib/world/discovery";

const emptyExisting = (): ExistingWorldEntities => ({
  characters: [],
  locations: [],
  themes: [],
  motifs: [],
  timeline: [],
});

describe("buildWorldDiscoveryPlan", () => {
  it("normalizes every supported Blueprint entity type", () => {
    const plan = buildWorldDiscoveryPlan(
      {
        characters: [{ name: "Mara", role: "Guide", voiceNotes: "Measured" }],
        locations: ["North Harbor"],
        majorThemes: [{ name: "Grace", notes: "Unearned restoration" }],
        recurringMotifs: ["Open doors"],
        timeline: [{ event: "Mara arrives", chapterNumber: 2 }],
      },
      [{ id: "chapter-2", chapter_number: 2 }],
      emptyExisting(),
    );

    expect(plan.inserts.characters[0]).toMatchObject({ name: "Mara", role: "Guide", voice_notes: "Measured" });
    expect(plan.inserts.locations[0]).toMatchObject({ name: "North Harbor" });
    expect(plan.inserts.themes[0]).toMatchObject({ name: "Grace", description: "Unearned restoration" });
    expect(plan.inserts.motifs[0]).toMatchObject({ name: "Open doors" });
    expect(plan.inserts.timeline[0]).toMatchObject({ note: "Mara arrives", chapter_id: "chapter-2", sequence_order: 1 });
  });

  it("preserves existing manual entities and deduplicates discoveries", () => {
    const existing = emptyExisting();
    existing.characters.push({ name: "Mara", source: "manual", description: "Author-owned" });
    existing.timeline.push({ note: "Mara arrives", chapter_id: "chapter-2", source: "manual" });

    const plan = buildWorldDiscoveryPlan(
      {
        characters: [" Mara ", { name: "MARA", role: "Guide" }, "Jon"],
        timeline: [{ event: "Mara arrives", chapterNumber: 2 }],
      },
      [{ id: "chapter-2", chapter_number: 2 }],
      existing,
    );

    expect(plan.inserts.characters).toEqual([{ name: "Jon", discovery_key: "jon" }]);
    expect(plan.skipped.characters).toBe(2);
    expect(plan.inserts.timeline).toEqual([]);
    expect(plan.skipped.timeline).toBe(1);
  });

  it("rejects malformed entries without creating blank rows", () => {
    const plan = buildWorldDiscoveryPlan(
      {
        characters: [{ role: "Missing name" }, null, ""],
        locations: "not-an-array",
        timeline: [{ chapterNumber: 1 }],
      },
      [],
      emptyExisting(),
    );

    expect(plan.inserts.characters).toEqual([]);
    expect(plan.inserts.locations).toEqual([]);
    expect(plan.inserts.timeline).toEqual([]);
    expect(plan.rejected.characters).toBe(3);
    expect(plan.rejected.timeline).toBe(1);
  });
});

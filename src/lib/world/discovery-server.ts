import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildWorldDiscoveryPlan,
  type ExistingWorldEntities,
  type WorldDiscoveryChapter,
  type WorldEntityType,
} from "@/lib/world/discovery";

const ENTITY_TABLES: Record<WorldEntityType, string> = {
  characters: "characters",
  locations: "locations",
  themes: "themes",
  motifs: "motifs",
  timeline: "timeline_notes",
};

export async function persistWorldDiscovery(input: {
  supabase: SupabaseClient;
  bookId: string;
  jobId: string;
  blueprint: unknown;
  chapters: WorldDiscoveryChapter[];
}) {
  const { supabase, bookId, jobId, blueprint, chapters } = input;
  const entityTypes = Object.keys(ENTITY_TABLES) as WorldEntityType[];
  const existingResults = await Promise.all(
    entityTypes.map((entityType) =>
      supabase.from(ENTITY_TABLES[entityType]).select("*").eq("book_id", bookId),
    ),
  );
  const existing = {} as ExistingWorldEntities;

  entityTypes.forEach((entityType, index) => {
    const result = existingResults[index];
    if (result.error) throw result.error;
    existing[entityType] = (result.data || []) as Record<string, unknown>[];
  });

  const plan = buildWorldDiscoveryPlan(blueprint, chapters, existing);
  const inserted = Object.fromEntries(entityTypes.map((entityType) => [entityType, 0])) as Record<WorldEntityType, number>;
  const discoveredAt = new Date().toISOString();

  for (const entityType of entityTypes) {
    const rows = plan.inserts[entityType].map((entity) => ({
      ...entity,
      book_id: bookId,
      source: "ai_discovered",
      discovery_job_id: jobId,
      discovered_at: discoveredAt,
    }));
    if (!rows.length) continue;

    const { error } = await supabase.from(ENTITY_TABLES[entityType]).insert(rows);
    if (error) throw error;
    inserted[entityType] = rows.length;
  }

  return {
    inserted,
    skipped: plan.skipped,
    rejected: plan.rejected,
  };
}

import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const ENTITY_TABLES = {
  characters: "characters",
  locations: "locations",
  themes: "themes",
  motifs: "motifs",
} as const;

export type SharedEntityType = keyof typeof ENTITY_TABLES;

export type SharedEntity = {
  linkId: string;
  entityType: SharedEntityType;
  entityId: string;
  name: string;
  description: string | null;
  role: string | null;
  sourceBookId: string;
  sourceBookTitle: string;
  createdAt: string;
};

/**
 * Live-joins series_shared_entities against the current character/location/
 * theme/motif rows rather than copying data, so a shared entry always
 * reflects the owning book's latest edit instead of a stale snapshot.
 */
export async function getSeriesSharedEntities(supabase: SupabaseClient, seriesId: string): Promise<SharedEntity[]> {
  const { data: links } = await supabase
    .from("series_shared_entities")
    .select("id,entity_type,source_book_id,source_entity_id,created_at")
    .eq("series_id", seriesId)
    .order("created_at", { ascending: false });

  if (!links?.length) return [];

  const bookIds = Array.from(new Set(links.map((l) => l.source_book_id)));
  const { data: books } = await supabase.from("books").select("id,title").in("id", bookIds);
  const bookTitleById = Object.fromEntries((books || []).map((b) => [b.id, b.title]));

  const entitiesByType = new Map<SharedEntityType, Map<string, { name: string; description: string | null; role?: string | null }>>();
  for (const entityType of Object.keys(ENTITY_TABLES) as SharedEntityType[]) {
    const ids = links.filter((l) => l.entity_type === entityType).map((l) => l.source_entity_id);
    if (!ids.length) continue;
    const { data: rows } =
      entityType === "characters"
        ? await supabase.from("characters").select("id,name,description,role").in("id", ids)
        : await supabase.from(ENTITY_TABLES[entityType]).select("id,name,description").in("id", ids);
    entitiesByType.set(
      entityType,
      new Map((rows || []).map((r) => [(r as { id: string }).id, r as { name: string; description: string | null; role?: string | null }])),
    );
  }

  return links.flatMap((link) => {
    const entityType = link.entity_type as SharedEntityType;
    const entity = entitiesByType.get(entityType)?.get(link.source_entity_id);
    if (!entity) return [];
    return [{
      linkId: link.id,
      entityType,
      entityId: link.source_entity_id,
      name: entity.name,
      description: entity.description,
      role: entity.role ?? null,
      sourceBookId: link.source_book_id,
      sourceBookTitle: bookTitleById[link.source_book_id] || "Untitled book",
      createdAt: link.created_at,
    }];
  });
}

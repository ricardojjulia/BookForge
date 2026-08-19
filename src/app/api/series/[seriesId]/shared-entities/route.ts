import { NextResponse } from "next/server";
import { z } from "zod";
import { getSeriesSharedEntities } from "@/lib/series/shared-entities";
import { createClient } from "@/lib/supabase/server";

const ENTITY_TABLES = {
  characters: "characters",
  locations: "locations",
  themes: "themes",
  motifs: "motifs",
} as const;

type EntityType = keyof typeof ENTITY_TABLES;

function isValidEntityType(type: string): type is EntityType {
  return type in ENTITY_TABLES;
}

const createSchema = z.object({
  entityType: z.enum(["characters", "locations", "themes", "motifs"]),
  entityId: z.string().uuid(),
  bookId: z.string().uuid(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const sharedEntities = await getSeriesSharedEntities(supabase, seriesId);
  return NextResponse.json({ sharedEntities });
}

export async function POST(request: Request, { params }: { params: Promise<{ seriesId: string }> }) {
  try {
    const { seriesId } = await params;
    const body = createSchema.parse(await request.json());
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!isValidEntityType(body.entityType)) return NextResponse.json({ error: "Invalid entity type." }, { status: 400 });

    const table = ENTITY_TABLES[body.entityType];
    const { data: entity } = await supabase.from(table).select("id").eq("id", body.entityId).eq("book_id", body.bookId).single();
    if (!entity) return NextResponse.json({ error: "Entity not found in that book." }, { status: 404 });

    const { data, error } = await supabase
      .from("series_shared_entities")
      .insert({
        series_id: seriesId,
        entity_type: body.entityType,
        source_book_id: body.bookId,
        source_entity_id: body.entityId,
        shared_by: user.id,
      })
      .select("id")
      .single();
    if (error) throw error;
    return NextResponse.json({ linkId: data.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed." }, { status: 500 });
  }
}

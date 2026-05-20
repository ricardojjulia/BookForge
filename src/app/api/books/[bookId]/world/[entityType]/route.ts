import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const ENTITY_TABLES = {
  characters: "characters",
  locations: "locations",
  themes: "themes",
  motifs: "motifs",
  timeline: "timeline_notes",
} as const;

type EntityType = keyof typeof ENTITY_TABLES;

function isValidEntityType(type: string): type is EntityType {
  return type in ENTITY_TABLES;
}

const createSchemas: Record<EntityType, z.ZodTypeAny> = {
  characters: z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(4000).optional(),
    role: z.string().max(200).optional(),
    voice_notes: z.string().max(2000).optional(),
    arc_notes: z.string().max(2000).optional(),
    relationship_notes: z.string().max(2000).optional(),
  }),
  locations: z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(4000).optional(),
  }),
  themes: z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(4000).optional(),
  }),
  motifs: z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(4000).optional(),
  }),
  timeline: z.object({
    note: z.string().min(1).max(4000),
    sequence_order: z.number().int().optional(),
    chapter_id: z.string().uuid().optional(),
  }),
};

export async function GET(_req: Request, { params }: { params: Promise<{ bookId: string; entityType: string }> }) {
  const { bookId, entityType } = await params;
  if (!isValidEntityType(entityType)) return NextResponse.json({ error: "Invalid entity type." }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const table = ENTITY_TABLES[entityType];
  const { data, error } = await supabase.from(table).select("*").eq("book_id", bookId).order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

export async function POST(request: Request, { params }: { params: Promise<{ bookId: string; entityType: string }> }) {
  const { bookId, entityType } = await params;
  if (!isValidEntityType(entityType)) return NextResponse.json({ error: "Invalid entity type." }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data: book } = await supabase.from("books").select("id").eq("id", bookId).eq("owner_id", user.id).single();
  if (!book) return NextResponse.json({ error: "Book not found." }, { status: 404 });

  const body = createSchemas[entityType].parse(await request.json());
  const table = ENTITY_TABLES[entityType];
  const { data, error } = await supabase.from(table).insert({ ...(body as object), book_id: bookId }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

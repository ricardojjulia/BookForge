import { NextResponse } from "next/server";
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

export async function PATCH(request: Request, { params }: { params: Promise<{ bookId: string; entityType: string; entityId: string }> }) {
  const { bookId, entityType, entityId } = await params;
  if (!isValidEntityType(entityType)) return NextResponse.json({ error: "Invalid entity type." }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const body = await request.json();
  const safeBody = Object.fromEntries(
    Object.entries(body as Record<string, unknown>).filter(
      ([k]) => !["id", "book_id", "created_at", "source", "discovery_key", "discovery_job_id", "discovered_at"].includes(k),
    ),
  );

  const table = ENTITY_TABLES[entityType];
  const { data, error } = await supabase
    .from(table)
    .update({
      ...safeBody,
      source: "manual",
      discovery_key: null,
      discovery_job_id: null,
      discovered_at: null,
    })
    .eq("id", entityId)
    .eq("book_id", bookId)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ bookId: string; entityType: string; entityId: string }> }) {
  const { bookId, entityType, entityId } = await params;
  if (!isValidEntityType(entityType)) return NextResponse.json({ error: "Invalid entity type." }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data: book } = await supabase.from("books").select("id").eq("id", bookId).eq("owner_id", user.id).single();
  if (!book) return NextResponse.json({ error: "Book not found." }, { status: 404 });

  const table = ENTITY_TABLES[entityType];
  const { error } = await supabase.from(table).delete().eq("id", entityId).eq("book_id", bookId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

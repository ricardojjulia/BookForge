import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser, unauthorizedResponse } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import {
  buildMetadataJson,
  branchSelectColumns,
  isMissingMetadataSchema,
  loadAccessibleBook,
  snapshotSelectColumns,
  toBranchResponse,
  toSnapshotResponse,
  type MetadataSnapshotRecord,
} from "@/lib/book-metadata/timeline";

const createSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  summary: z.string().max(4000).optional(),
  metadataJson: z.record(z.string(), z.unknown()).optional(),
  branchName: z.string().min(1).max(80).optional(),
  parentSnapshotId: z.string().uuid().nullable().optional(),
  sourceType: z.enum(["initial_plan", "critic_update", "manual_edit", "system_merge"]).optional(),
  sourceRefId: z.string().uuid().nullable().optional(),
  setAsActive: z.boolean().optional(),
});

export async function GET(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await params;
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") || "40") || 40));
    const branchName = url.searchParams.get("branch")?.trim() || "";
    const status = url.searchParams.get("status")?.trim() || "";
    const cursor = url.searchParams.get("cursor")?.trim() || "";

    const supabase = await createClient();
    const { user, error: authError } = await getAuthenticatedUser(supabase);
    if (authError || !user) return unauthorizedResponse();

    let snapshotQuery = supabase
      .from("book_metadata_snapshots")
      .select(snapshotSelectColumns())
      .eq("book_id", bookId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (branchName) snapshotQuery = snapshotQuery.eq("branch_name", branchName);
    if (status) snapshotQuery = snapshotQuery.eq("status", status);
    if (cursor) snapshotQuery = snapshotQuery.lt("created_at", cursor);

    const { data: snapshots, error: snapshotError } = await snapshotQuery;
    if (snapshotError) {
      if (isMissingMetadataSchema(snapshotError)) {
        return NextResponse.json({ snapshots: [], branches: [], unavailable: true, reason: "Metadata timeline tables are not installed. Run the latest Supabase migrations." });
      }
      throw snapshotError;
    }

    const { data: branches, error: branchError } = await supabase
      .from("book_metadata_branches")
      .select(branchSelectColumns())
      .eq("book_id", bookId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (branchError) {
      if (isMissingMetadataSchema(branchError)) {
        return NextResponse.json({ snapshots: (snapshots || []).map((row) => toSnapshotResponse(row as MetadataSnapshotRecord)), branches: [], unavailable: true, reason: "Metadata timeline tables are not installed. Run the latest Supabase migrations." });
      }
      throw branchError;
    }

    return NextResponse.json({
      snapshots: (snapshots || []).map((row) => toSnapshotResponse(row as MetadataSnapshotRecord)),
      branches: (branches || []).map((row) => toBranchResponse(row)),
    });
  } catch (error) {
    console.error("Metadata snapshots load failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load metadata snapshots." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await params;
    const body = createSchema.parse(await request.json().catch(() => ({})));
    const supabase = await createClient();
    const { user, error: authError } = await getAuthenticatedUser(supabase);
    if (authError || !user) return unauthorizedResponse();

    const book = await loadAccessibleBook(supabase, bookId);
    if (!book) return NextResponse.json({ error: "Book not found." }, { status: 404 });

    const branchName = body.branchName?.trim() || "main";
    const metadataJson = body.metadataJson || buildMetadataJson(book, {
      title: body.title,
      summary: body.summary,
      metadataJson: body.metadataJson,
      sourceType: body.sourceType,
      branchName,
    });
    const now = new Date().toISOString();
    const status = body.setAsActive === false ? "draft" : "active";

    if (status === "active") {
      const { error: deactivateError } = await supabase
        .from("book_metadata_snapshots")
        .update({ status: "draft", updated_at: now })
        .eq("book_id", bookId)
        .eq("branch_name", branchName)
        .eq("status", "active");
      if (deactivateError) throw deactivateError;
    }

    const { data: snapshot, error: snapshotError } = await supabase
      .from("book_metadata_snapshots")
      .insert({
        book_id: bookId,
        branch_name: branchName,
        parent_snapshot_id: body.parentSnapshotId || null,
        status,
        title: body.title?.trim() || `${book.title || "Untitled book"} baseline`,
        summary: body.summary?.trim() || "Initial metadata baseline seeded from current book state.",
        metadata_json: metadataJson,
        source_type: body.sourceType || "manual_edit",
        source_ref_id: body.sourceRefId || null,
        created_by: user.id,
        created_at: now,
        updated_at: now,
      })
      .select(snapshotSelectColumns())
      .single();

    if (snapshotError) {
      if (isMissingMetadataSchema(snapshotError)) {
        return NextResponse.json({ error: "Metadata timeline tables are not installed. Run the latest Supabase migrations." }, { status: 503 });
      }
      throw snapshotError;
    }

    const { data: branch, error: branchError } = await supabase
      .from("book_metadata_branches")
      .upsert(
        {
          book_id: bookId,
          name: branchName,
          head_snapshot_id: snapshot.id,
          is_default: branchName === "main",
          created_by: user.id,
          updated_at: now,
        },
        { onConflict: "book_id,name" },
      )
      .select(branchSelectColumns())
      .single();

    if (branchError) throw branchError;

    return NextResponse.json({ snapshot: toSnapshotResponse(snapshot as MetadataSnapshotRecord), branch: toBranchResponse(branch) });
  } catch (error) {
    console.error("Metadata snapshot create failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create metadata snapshot." }, { status: 500 });
  }
}

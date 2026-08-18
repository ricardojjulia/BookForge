import { Alert, Container, Stack, Title } from "@mantine/core";
import { ChapterMetadataPanel } from "@/components/books/chapter-metadata-panel";
import { ChapterSummaryReview } from "@/components/books/chapter-summary-review";
import { ChapterSummaryViewer } from "@/components/books/chapter-summary-viewer";
import { PassageLockManager } from "@/components/books/passage-lock-manager";
import { SceneEditorPanel } from "@/components/books/scene-editor-panel";
import { StructureAuditPanel } from "@/components/books/structure-audit-panel";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ManuscriptPage({ params }: { params: Promise<{ bookId: string }> }) {
  if (!hasSupabaseEnv()) {
    return (
      <Container>
        <Alert color="yellow">Configure Supabase before opening manuscript editing.</Alert>
      </Container>
    );
  }

  const { bookId } = await params;
  const supabase = await createClient();
  const [{ data: chapters }, { data: paragraphRows }, { data: sceneRows }, { data: sceneSplitSuggestions }] = await Promise.all([
    supabase
      .from("chapters")
      .select("id,chapter_number,title,summary,status,original_text,section_type,exclude_from_rewrite,exclude_from_export,structure_notes")
      .eq("book_id", bookId)
      .order("chapter_number"),
    supabase
      .from("paragraphs")
      .select("id,chapter_id,scene_id,paragraph_number,original_text,accepted_text,is_locked")
      .eq("book_id", bookId)
      .order("paragraph_number"),
    supabase
      .from("scenes")
      .select("id,chapter_id,scene_number,title,summary,status")
      .eq("book_id", bookId)
      .order("scene_number"),
    supabase
      .from("scene_split_suggestions")
      .select("id,chapter_id,start_paragraph_id,title,rationale,status")
      .eq("book_id", bookId)
      .eq("status", "pending"),
  ]);

  return (
    <Container size="xl">
      <Title style={{ fontSize: 28, fontWeight: 800, color: "oklch(0.2 0.005 90)", letterSpacing: "-0.01em" }} mb={24}>
        Manuscript
      </Title>
      <Stack gap="xl">
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "oklch(0.2 0.005 90)", marginBottom: 14 }}>
            Manuscript Health
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            <ChapterMetadataPanel bookId={bookId} chapters={chapters || []} paragraphs={paragraphRows || []} />
            <StructureAuditPanel chapters={chapters || []} paragraphs={paragraphRows || []} />
            <SceneEditorPanel
              chapters={chapters || []}
              scenes={sceneRows || []}
              paragraphs={paragraphRows || []}
              suggestions={sceneSplitSuggestions || []}
            />
          </div>
        </div>

        <div style={{ background: "#fff", border: "1px solid oklch(0.92 0.003 90)", borderRadius: 12, padding: "24px 26px" }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "oklch(0.2 0.005 90)", marginBottom: 16 }}>Chapter Browser</div>
          <ChapterSummaryReview bookId={bookId} chapters={chapters || []} />
          <PassageLockManager chapters={chapters || []} paragraphs={paragraphRows || []} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14, marginTop: 20 }}>
            {chapters?.map((chapter) => (
              <div
                key={chapter.id}
                style={{
                  border: "1px solid oklch(0.92 0.003 90)",
                  borderRadius: 10,
                  padding: 18,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  background: "oklch(0.99 0.002 90)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 26, fontWeight: 800, color: "oklch(0.85 0.02 275)" }}>
                    {String(chapter.chapter_number).padStart(2, "0")}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.02em",
                      padding: "4px 9px",
                      borderRadius: 6,
                      background: "oklch(0.94 0.04 275)",
                      color: "oklch(0.45 0.13 275)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {(chapter.status || "draft").toUpperCase()}
                  </span>
                </div>
                <span style={{ fontSize: 15, fontWeight: 700, color: "oklch(0.2 0.005 90)" }}>
                  {chapter.title || `Chapter ${chapter.chapter_number}`}
                </span>
                <div style={{ marginTop: "auto" }}>
                  <ChapterSummaryViewer
                    chapterId={chapter.id}
                    chapterNumber={chapter.chapter_number}
                    title={chapter.title}
                    summary={chapter.summary}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </Stack>
    </Container>
  );
}

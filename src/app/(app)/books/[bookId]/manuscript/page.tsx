import { Alert, Badge, Container, Paper, Stack, Table, Title } from "@mantine/core";
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
      <Title mb="xl">Manuscript</Title>
      <Stack gap="xl">
        <ChapterMetadataPanel bookId={bookId} chapters={chapters || []} paragraphs={paragraphRows || []} />

        <StructureAuditPanel chapters={chapters || []} paragraphs={paragraphRows || []} />

        <SceneEditorPanel
          chapters={chapters || []}
          scenes={sceneRows || []}
          paragraphs={paragraphRows || []}
          suggestions={sceneSplitSuggestions || []}
        />

        <Paper withBorder radius="md" p="xl" bg="white">
          <Title order={2} mb="md">
            Chapter Browser
          </Title>
          <ChapterSummaryReview bookId={bookId} chapters={chapters || []} />
          <PassageLockManager chapters={chapters || []} paragraphs={paragraphRows || []} />
          <Table striped highlightOnHover>
            <thead>
              <tr>
                <th>#</th>
                <th>Title</th>
                <th>Status</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {chapters?.map((chapter) => (
                <tr key={chapter.id}>
                  <td>{chapter.chapter_number}</td>
                  <td>{chapter.title}</td>
                  <td>
                    <Badge variant="light">{chapter.status}</Badge>
                  </td>
                  <td>
                    <ChapterSummaryViewer
                      chapterId={chapter.id}
                      chapterNumber={chapter.chapter_number}
                      title={chapter.title}
                      summary={chapter.summary}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Paper>
      </Stack>
    </Container>
  );
}

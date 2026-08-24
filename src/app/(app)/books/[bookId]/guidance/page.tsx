import { Alert, Container, Title } from "@mantine/core";
import { GuidanceWorkflowPanel } from "@/components/books/guidance/guidance-workflow-panel";
import { getBookCriticReports } from "@/lib/books/book-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function GuidancePage({ params }: { params: Promise<{ bookId: string }> }) {
  if (!hasSupabaseEnv()) {
    return (
      <Container>
        <Alert color="yellow">Configure Supabase before opening guidance.</Alert>
      </Container>
    );
  }

  const { bookId } = await params;
  const supabase = await createClient();
  const [{ reports }, { count: chapterCount }, { count: sceneCount }, { count: paragraphCount }, { data: latestAccepted }] =
    await Promise.all([
      getBookCriticReports(supabase, bookId),
      supabase.from("chapters").select("id", { count: "exact", head: true }).eq("book_id", bookId),
      supabase.from("scenes").select("id", { count: "exact", head: true }).eq("book_id", bookId),
      supabase.from("paragraphs").select("id", { count: "exact", head: true }).eq("book_id", bookId),
      supabase
        .from("paragraphs")
        .select("updated_at")
        .eq("book_id", bookId)
        .not("accepted_text", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  // Guidance synthesizes from baseline Critic reports -- if paragraphs have
  // been accepted (rewritten) more recently than Critic last ran, that
  // synthesis is working from a manuscript state that no longer exists.
  // Found live: a Guidance report told the user a chapter summary was
  // missing and scenes needed sensory detail, both already fixed by rewrite
  // work that happened after the baseline Critic pass it was built from.
  const latestCriticAt = reports
    .filter((report) => report.report_type.startsWith("critic:"))
    .reduce<string | null>((latest, report) => (!latest || report.created_at > latest ? report.created_at : latest), null);
  const criticStale = Boolean(latestAccepted?.updated_at) && (!latestCriticAt || (latestAccepted?.updated_at as string) > latestCriticAt);

  return (
    <Container size="xl">
      <Title mb="xl">Guidance</Title>
      <GuidanceWorkflowPanel
        bookId={bookId}
        reports={reports}
        criticStale={criticStale}
        chapterCount={chapterCount || 0}
        sceneCount={sceneCount || 0}
        paragraphCount={paragraphCount || 0}
      />
    </Container>
  );
}

import { Alert, Container, Stack, Title } from "@mantine/core";
import Link from "next/link";
import { AutoReviewWizard } from "@/components/books/auto-review/auto-review-wizard";
import { BookActions } from "@/components/books/book-actions";
import { PersistentAiJobsPanel } from "@/components/books/jobs/persistent-ai-jobs-panel";
import { CriticScoreboard } from "@/components/books/reports/critic-scoreboard";
import { detectAndHealStaleJobs } from "@/lib/ai/job-state";
import { getBookCriticReports } from "@/lib/books/book-data";
import { isManagedSaasDeployment } from "@/lib/deployment/mode";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function StudioPage({ params }: { params: Promise<{ bookId: string }> }) {
  if (!hasSupabaseEnv()) {
    return (
      <Container>
        <Alert color="yellow">Configure Supabase before opening Studio.</Alert>
      </Container>
    );
  }

  const { bookId } = await params;
  const supabase = await createClient();
  const [{ data: book, error }, { data: chapters }, { count: scenes }, { count: paragraphs }, { data: bookBible }] =
    await Promise.all([
      supabase.from("books").select("id,title").eq("id", bookId).single(),
      supabase.from("chapters").select("id,status,original_text,summary").eq("book_id", bookId),
      supabase.from("scenes").select("id", { count: "exact", head: true }).eq("book_id", bookId),
      supabase.from("paragraphs").select("id", { count: "exact", head: true }).eq("book_id", bookId),
      supabase.from("book_bibles").select("updated_at").eq("book_id", bookId).maybeSingle(),
    ]);

  if (error || !book) {
    return (
      <Container>
        <Alert color="red">Book not found or you do not have access.</Alert>
      </Container>
    );
  }

  const { reports: criticReports } = await getBookCriticReports(supabase, bookId);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: activeJobs } = await supabase
      .from("revision_jobs")
      .select("id,mode,status,settings,created_at")
      .eq("book_id", bookId)
      .in("status", ["running", "queued"]);
    if (activeJobs?.length) {
      await detectAndHealStaleJobs(supabase, user.id, activeJobs);
    }
  }

  const plannedChapterCount =
    chapters?.filter(
      (chapter) =>
        chapter.status === "planned" ||
        /Draft text has not been generated yet\. This planned chapter shell was created from BookForge Creator architecture\./i.test(
          chapter.original_text || "",
        ),
    ).length || 0;
  const summarizedChapterCount = chapters?.filter((chapter) => Boolean(chapter.summary)).length || 0;

  const quickLinks: { label: string; href: string }[] = [
    { label: "World Bible", href: `/books/${bookId}/world` },
    {
      label: "Reader View",
      href: `/books/${bookId}/read?returnTo=${encodeURIComponent(`/books/${bookId}/studio`)}&returnLabel=${encodeURIComponent("Back to Studio")}`,
    },
    { label: "Abridged Edition", href: `/books/${bookId}/abridgement` },
    { label: "Publishing Lab", href: `/books/${bookId}/publishing-lab` },
    { label: "Jobs History", href: `/books/${bookId}/jobs` },
  ];

  return (
    <Container size="xl">
      <Title style={{ fontSize: 28, fontWeight: 800, color: "oklch(0.2 0.005 90)", letterSpacing: "-0.01em" }} mb={24}>
        Studio
      </Title>
      <Stack gap="xl">
        <div
          id="studio-actions"
          style={{ background: "#fff", border: "1px solid oklch(0.92 0.003 90)", borderRadius: 12, padding: "24px 26px" }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 19, fontWeight: 800, color: "oklch(0.2 0.005 90)" }}>Studio Actions</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.03em",
                  padding: "4px 10px",
                  borderRadius: 5,
                  background: "oklch(0.94 0.04 275)",
                  color: "oklch(0.45 0.13 275)",
                }}
              >
                {isManagedSaasDeployment() ? "CLOUD AI PROVIDER" : "LOCAL AI VIA LM STUDIO"}
              </span>
            </div>
            <AutoReviewWizard bookId={bookId} bookTitle={book.title} plannedChapterCount={plannedChapterCount} />
          </div>
          <p style={{ margin: "0 0 18px", fontSize: 14, color: "oklch(0.5 0.005 90)" }}>
            Analyze, evaluate, revise, review, and export this manuscript from one controlled workflow.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
            {quickLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                style={{
                  textDecoration: "none",
                  display: "inline-block",
                  background: "#fff",
                  color: "oklch(0.35 0.005 90)",
                  border: "1px solid oklch(0.87 0.005 90)",
                  padding: "8px 16px",
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                {link.label}
              </Link>
            ))}
          </div>
          <BookActions
            bookId={bookId}
            chapterCount={chapters?.length || 0}
            sceneCount={scenes || 0}
            paragraphCount={paragraphs || 0}
            plannedChapterCount={plannedChapterCount}
            bookBibleUpdatedAt={bookBible?.updated_at || null}
            summarizedChapterCount={summarizedChapterCount}
          />
        </div>

        <CriticScoreboard reports={criticReports} />

        <PersistentAiJobsPanel bookId={bookId} />
      </Stack>
    </Container>
  );
}

"use client";

import { useState } from "react";
import { Paper, Stack } from "@mantine/core";
import { ManuscriptSearch } from "@/components/books/manuscript-search";
import { ReaderView } from "@/components/books/reader/reader-view";

type Chapter = { id: string; chapter_number: number; title: string | null };
type Paragraph = { id: string; chapter_id: string; paragraph_number: number; original_text: string | null; accepted_text: string | null };
type Annotation = { id: string; paragraph_id: string | null; note: string; resolved: boolean; created_at: string };

export function ReaderWithSearch({
  bookId,
  chapters,
  paragraphs,
  initialAnnotations,
}: {
  bookId: string;
  chapters: Chapter[];
  paragraphs: Paragraph[];
  initialAnnotations: Annotation[];
}) {
  const [highlightParagraphId, setHighlightParagraphId] = useState<string | null>(null);

  return (
    <Stack gap="xl">
      <Paper withBorder radius="md" p="md" bg="white">
        <ManuscriptSearch
          bookId={bookId}
          onNavigate={(_chapterId, paragraphId) => setHighlightParagraphId(paragraphId)}
        />
      </Paper>
      <ReaderView
        bookId={bookId}
        chapters={chapters}
        paragraphs={paragraphs}
        initialAnnotations={initialAnnotations}
        highlightParagraphId={highlightParagraphId}
      />
    </Stack>
  );
}

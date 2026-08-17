import Link from "next/link";
import { Alert, Badge, Button, Container, Group, Stack, Text, Title } from "@mantine/core";
import { ReaderWithSearch } from "@/components/books/reader/reader-with-search";
import { getBookCore } from "@/lib/books/book-data";
import { safeReturnHref, safeReturnLabel } from "@/lib/navigation/return-link";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ReaderPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookId: string }>;
  searchParams: Promise<{ returnTo?: string; returnLabel?: string }>;
}) {
  if (!hasSupabaseEnv()) {
    return (
      <Container>
        <Alert color="yellow">Configure Supabase to use the reader view.</Alert>
      </Container>
    );
  }

  const { bookId } = await params;
  const { returnTo, returnLabel } = await searchParams;
  const returnHref = safeReturnHref(returnTo, bookId);
  const returnText = safeReturnLabel(returnLabel);
  const supabase = await createClient();

  const [{ data: book }, { data: chapters }, { data: paragraphs }, { data: annotations }] = await Promise.all([
    getBookCore(supabase, bookId),
    supabase.from("chapters").select("id,chapter_number,title").eq("book_id", bookId).order("chapter_number"),
    supabase.from("paragraphs").select("id,chapter_id,paragraph_number,original_text,accepted_text,current_text,updated_at").eq("book_id", bookId).order("paragraph_number"),
    supabase.from("reader_annotations").select("id,paragraph_id,note,resolved,created_at").eq("book_id", bookId).order("created_at", { ascending: false }),
  ]);

  if (!book) {
    return (
      <Container>
        <Alert color="red">Book not found or access denied.</Alert>
      </Container>
    );
  }

  return (
    <Container size="md">
      <Stack gap="xs" mb="xl">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title>{book.title}</Title>
            {book.author_name && <Text c="dimmed">{book.author_name}</Text>}
            <Badge color="grape" variant="light" w="fit-content">Reader View</Badge>
          </div>
          <Link href={returnHref} style={{ textDecoration: "none" }}>
            <Button color="dark" variant="light">
              {returnText}
            </Button>
          </Link>
        </Group>
      </Stack>
      <ReaderWithSearch
        bookId={bookId}
        chapters={chapters || []}
        paragraphs={paragraphs || []}
        initialAnnotations={annotations || []}
      />
    </Container>
  );
}

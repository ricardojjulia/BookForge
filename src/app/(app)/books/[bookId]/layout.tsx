import { Container } from "@mantine/core";
import { BookProvider } from "@/components/books/book-provider";
import { BookSubnav } from "@/components/layout/book-subnav";
import { getBookCore } from "@/lib/books/book-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export default async function BookLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ bookId: string }>;
}) {
  if (!hasSupabaseEnv()) return children;

  const { bookId } = await params;
  const supabase = await createClient();
  const { data: book } = await getBookCore(supabase, bookId);

  // No subnav for a book that doesn't exist/isn't accessible -- let the
  // page's own not-found/access-denied branch render without a chrome
  // that implies the book loaded successfully.
  if (!book) return children;

  return (
    <BookProvider book={book}>
      <Container size="xl" pt="md">
        <BookSubnav bookId={bookId} bookTitle={book.title} />
      </Container>
      {children}
    </BookProvider>
  );
}

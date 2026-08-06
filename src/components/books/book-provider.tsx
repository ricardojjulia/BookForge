"use client";

import { createContext, useContext } from "react";
import type { BookCore } from "@/lib/books/book-data";

const BookContext = createContext<BookCore | null>(null);

export function BookProvider({ book, children }: { book: BookCore; children: React.ReactNode }) {
  return <BookContext.Provider value={book}>{children}</BookContext.Provider>;
}

/** Access the current book's core fields (id/title/status/author_name) without re-fetching per route. */
export function useBookCore(): BookCore {
  const book = useContext(BookContext);
  if (!book) throw new Error("useBookCore must be used within a BookProvider");
  return book;
}

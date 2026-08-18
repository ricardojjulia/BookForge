"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert, Badge, Button, Group, Paper, Stack, Text, TextInput } from "@mantine/core";
import { fetchJson } from "@/lib/http/fetch-json";

type Book = {
  id: string;
  title: string;
  author_name: string | null;
  status: string | null;
  owner_id: string;
  ownerEmail: string | null;
  updated_at: string | null;
};

export function StewardBooksClient({ initialBooks }: { initialBooks: Book[] }) {
  const [books, setBooks] = useState<Book[]>(initialBooks);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(query: string) {
    setLoading(true);
    setError("");
    try {
      const result = await fetchJson<{ books: Book[] }>(
        `/api/steward/books${query ? `?search=${encodeURIComponent(query)}` : ""}`,
        {},
        "Load books",
      );
      setBooks(result.books);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load books.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Opening a book here uses your Steward access to view/edit it like any admin-tier collaborator would — the same pages every owner uses.
      </Text>
      <Group>
        <TextInput
          placeholder="Search by title"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          onKeyDown={(event) => { if (event.key === "Enter") void load(search); }}
          style={{ flex: 1 }}
        />
        <Button variant="light" color="grape" loading={loading} onClick={() => load(search)}>Search</Button>
      </Group>

      {error && <Alert color="red">{error}</Alert>}
      {!loading && !books.length && <Text c="dimmed">No books found.</Text>}

      <Stack gap="xs">
        {books.map((book) => (
          <Paper key={book.id} withBorder radius="md" p="md" component={Link} href={`/books/${book.id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <Group justify="space-between" align="flex-start" wrap="wrap">
              <div>
                <Group gap="xs">
                  <Text fw={700}>{book.title}</Text>
                  {book.status && <Badge color="grape" variant="light">{book.status}</Badge>}
                </Group>
                <Text size="xs" c="dimmed">
                  {book.author_name || "No author set"} · owner {book.ownerEmail || book.owner_id}
                  {book.updated_at ? ` · updated ${new Date(book.updated_at).toLocaleDateString()}` : ""}
                </Text>
              </div>
            </Group>
          </Paper>
        ))}
      </Stack>
    </Stack>
  );
}

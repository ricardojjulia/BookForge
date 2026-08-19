import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/books/[bookId]/export/route";

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}));

vi.mock("@/lib/export/markdown", () => ({
  buildFinalManuscriptMarkdown: vi.fn(() => "# Title\n\nBody\n"),
}));

vi.mock("@/lib/export/docx", () => ({
  buildFinalManuscriptDocx: vi.fn(async () => Buffer.from("docx")),
}));

vi.mock("@/lib/export/epub", () => ({
  buildFinalManuscriptEpub: vi.fn(async () => Buffer.from("epub")),
}));

vi.mock("@/lib/export/pdf", () => ({
  buildFinalManuscriptPdf: vi.fn(async () => Buffer.from("pdf")),
}));

vi.mock("@/lib/books/status", () => ({
  markBookExported: vi.fn(async () => undefined),
}));

type SupabaseBuilder = {
  select: (columns: string) => SupabaseBuilder;
  eq: (column: string, value: unknown) => SupabaseBuilder;
  order: () => SupabaseBuilder;
  limit: () => SupabaseBuilder;
  single: () => Promise<{ data: unknown; error: unknown }>;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  insert: (payload: unknown) => SupabaseBuilder;
  update: (payload: unknown) => SupabaseBuilder;
  not: () => SupabaseBuilder;
  then: (resolve: (value: { data: unknown; error: unknown }) => unknown) => unknown;
};

const captured: { exportInsert: Record<string, unknown> | null } = {
  exportInsert: null,
};

function createBuilder(table: string): SupabaseBuilder {
  let mode: "select" | "insert" | "update" = "select";
  let selectedColumns = "";

  const result = { data: null as unknown, error: null as unknown };

  const builder: SupabaseBuilder = {
    select(columns: string) {
      selectedColumns = columns;
      return builder;
    },
    eq() {
      return builder;
    },
    order() {
      return builder;
    },
    limit() {
      return builder;
    },
    insert(payload: unknown) {
      mode = "insert";
      if (table === "exports" && payload && typeof payload === "object") {
        captured.exportInsert = payload as Record<string, unknown>;
      }
      return builder;
    },
    update() {
      mode = "update";
      return builder;
    },
    not() {
      return builder;
    },
    async single() {
      if (table === "books" && mode === "select") {
        return { data: { id: "book-1", title: "Test Book", author_name: "Author" }, error: null };
      }
      if (table === "exports" && mode === "insert") {
        return { data: { id: "export-1" }, error: null };
      }
      return { data: null, error: null };
    },
    async maybeSingle() {
      return { data: null, error: null };
    },
    then(resolve) {
      if (table === "chapters" && mode === "select") {
        result.data = [
          { id: "ch-1", chapter_number: 1, title: "Chapter 1", section_type: "chapter", exclude_from_export: false },
        ];
      } else if (table === "paragraphs" && mode === "select") {
        if (selectedColumns.includes("accepted_text")) {
          result.data = [
            {
              id: "p-1",
              chapter_id: "ch-1",
              scene_id: null,
              paragraph_number: 1,
              original_text: "Original",
              current_text: "Current",
              accepted_text: "Accepted",
              is_locked: false,
            },
          ];
        } else {
          result.data = [];
        }
      } else if (table === "book_matter_sections" && mode === "select") {
        result.data = [];
      } else {
        result.data = null;
      }
      return resolve(result);
    },
  };

  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

describe("POST /api/books/[bookId]/export", () => {
  it("persists normalized EPUB/PDF metadata into export metadata", async () => {
    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => createBuilder(table)),
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn(async () => ({ error: null })),
          createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "https://signed" } })),
        })),
      },
    });
    captured.exportInsert = null;

    const response = await POST(
      new Request("http://localhost/api/books/book-1/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          format: "markdown",
          sourceMode: "accepted",
          includeFrontMatter: true,
          includeBackMatter: true,
          useOriginalForLocked: true,
          abridgedMode: false,
          epubMetadata: {
            language: "en-US",
            publisher: "   ",
            copyright: " Copyright 2026 ",
            description: "  Description  ",
          },
          pdfOptions: {
            fontSize: 12,
            lineGap: 2,
            pageNumbers: true,
            pageSize: "A4",
          },
        }),
      }),
      { params: Promise.resolve({ bookId: "book-1" }) },
    );

    const payload = await response.json();
    expect(response.status, JSON.stringify(payload)).toBe(200);

    // TypeScript 6's control-flow analysis narrows `captured.exportInsert` to
    // `never` here, treating the `= null` reset above as still in effect
    // across the `await POST(...)` call even though POST's mocked insert()
    // reassigns it -- an explicit re-cast breaks that (over-eager) narrowing.
    const exportInsert = captured.exportInsert as Record<string, unknown> | null;
    const metadata = (exportInsert?.metadata || {}) as Record<string, unknown>;
    expect(metadata.epubMetadata).toEqual({
      language: "en-US",
      copyright: "Copyright 2026",
      description: "Description",
    });
    expect(metadata.pdfOptions).toEqual({
      fontSize: 12,
      lineGap: 2,
      pageNumbers: true,
      pageSize: "A4",
    });
  });
});

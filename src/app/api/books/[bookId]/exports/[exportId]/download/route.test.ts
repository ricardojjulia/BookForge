import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/books/[bookId]/exports/[exportId]/download/route";

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient }));

function params() {
  return { params: Promise.resolve({ bookId: "book-1", exportId: "export-1" }) };
}

describe("export download route", () => {
  it("requires authentication", async () => {
    mockCreateClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } });
    const response = await GET(new Request("http://localhost"), params());
    expect(response.status).toBe(401);
  });

  it("does not hardcode an owner_id filter -- lets RLS decide visibility, so a collaborator (not the owner) can still find the book", async () => {
    // The books query builder never receives an owner_id .eq() call in this test:
    // if the route regressed back to hardcoding owner_id, this collaborator
    // (whose id never appears anywhere in the mock) would still resolve here,
    // because a real Supabase client would apply that literal filter regardless
    // of RLS -- this test can't directly prove RLS involvement, but it does prove
    // the route itself makes no additional owner-scoped assertion beyond `id`.
    const eqCalls: Array<[string, unknown]> = [];
    const booksBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn(function (this: unknown, column: string, value: unknown) {
        eqCalls.push([column, value]);
        return this;
      }),
      single: vi.fn().mockResolvedValue({ data: { id: "book-1" } }),
    };
    const exportsBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: "export-1", status: "completed", storage_path: "book-1/export.docx" } }),
    };
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "collaborator-user" } } }) },
      from: vi.fn((table: string) => (table === "books" ? booksBuilder : exportsBuilder)),
      storage: {
        from: vi.fn(() => ({
          createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed.example.com/export.docx" }, error: null }),
        })),
      },
    };
    mockCreateClient.mockResolvedValue(supabase);

    const response = await GET(new Request("http://localhost"), params());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://signed.example.com/export.docx");
    expect(eqCalls).toEqual([["id", "book-1"]]);
    expect(eqCalls.some(([column]) => column === "owner_id")).toBe(false);
  });

  it("returns 404 when the export is not completed", async () => {
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
      from: vi.fn((table: string) =>
        table === "books"
          ? { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: "book-1" } }) }
          : { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: "export-1", status: "pending", storage_path: null } }) },
      ),
    };
    mockCreateClient.mockResolvedValue(supabase);

    const response = await GET(new Request("http://localhost"), params());
    expect(response.status).toBe(404);
  });
});

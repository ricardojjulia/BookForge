import { describe, expect, it, vi } from "vitest";
import { getCreativeWriterWorkspaceData, isMissingCreativeWriterLedger } from "@/lib/creativewriter-ui/dashboard";

describe("CreativeWriter workspace data", () => {
  it("treats a missing sync ledger table as an empty conflict queue", async () => {
    const supabase = createDashboardSupabase({
      conflictError: {
        code: "PGRST205",
        message: "Could not find the table 'public.creativewriter_sync_events' in the schema cache",
      },
    });

    const result = await getCreativeWriterWorkspaceData({ supabase, accountId: "user-1" });

    expect(result.selectedBook?.id).toBe("book-1");
    expect(result.conflicts).toEqual([]);
    expect(result.chapters).toHaveLength(1);
    expect(result.paragraphs).toHaveLength(1);
    expect(result.support.references).toHaveLength(1);
    expect(result.support.authorNotes?.creativeInstructions).toBe("Keep the forge metaphor tactile.");
    expect(result.support.bible.characters[0]?.name).toBe("Mara Vale");
  });

  it("identifies the missing CreativeWriter ledger schema-cache error", () => {
    expect(
      isMissingCreativeWriterLedger({
        code: "PGRST205",
        message: "Could not find the table 'public.creativewriter_sync_events' in the schema cache",
      }),
    ).toBe(true);
    expect(isMissingCreativeWriterLedger({ code: "PGRST205", message: "Could not find books" })).toBe(false);
  });
});

function createDashboardSupabase(options: { conflictError?: unknown } = {}) {
  return {
    from: vi.fn((table: string) => {
      const builder = {
        select() {
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
        then(resolve: (value: { data: unknown[] | null; error: unknown }) => unknown) {
          if (table === "books") {
            return resolve({
              data: [{ id: "book-1", title: "The Forge", author_name: "Author", status: "draft", updated_at: "2026-08-02T12:00:00.000Z" }],
              error: null,
            });
          }
          if (table === "chapters") {
            return resolve({
              data: [{ id: "chapter-1", chapter_number: 1, title: "Opening", summary: null, current_text: "Chapter text.", updated_at: "2026-08-02T12:00:00.000Z" }],
              error: null,
            });
          }
          if (table === "paragraphs") {
            return resolve({
              data: [{ id: "paragraph-1", chapter_id: "chapter-1", paragraph_number: 1, current_text: "Paragraph text.", accepted_text: null, updated_at: "2026-08-02T12:00:00.000Z" }],
              error: null,
            });
          }
          if (table === "creativewriter_sync_events") {
            return resolve({ data: null, error: options.conflictError || null });
          }
          if (table === "author_notes") {
            return resolve({
              data: [
                {
                  creative_instructions: "Keep the forge metaphor tactile.",
                  voice_guidance: "Plainspoken.",
                  worldview_notes: "Craft carries responsibility.",
                  theological_alignment: "Honor conscience.",
                  forbidden_changes: "Do not rename the forge.",
                  updated_at: "2026-08-02T12:00:00.000Z",
                },
              ],
              error: null,
            });
          }
          if (table === "reference_materials") {
            return resolve({
              data: [
                {
                  id: "reference-1",
                  title: "Smithing archive",
                  material_type: "research",
                  content: "Historical notes on hand-forged tools.",
                  include_in_prompts: true,
                  created_at: "2026-08-02T12:00:00.000Z",
                },
              ],
              error: null,
            });
          }
          if (table === "book_bibles") {
            return resolve({ data: [{ content: { summary: "A maker learns what must be reforged." }, updated_at: "2026-08-02T12:00:00.000Z" }], error: null });
          }
          if (table === "characters") {
            return resolve({ data: [{ id: "character-1", name: "Mara Vale", description: "A careful apprentice.", role: "protagonist" }], error: null });
          }
          if (table === "locations") {
            return resolve({ data: [{ id: "location-1", name: "The Old Foundry", description: "A working forge below the hill." }], error: null });
          }
          if (table === "themes") {
            return resolve({ data: [{ id: "theme-1", name: "Restoration", description: "Broken tools can carry new service." }], error: null });
          }
          if (table === "motifs") {
            return resolve({ data: [{ id: "motif-1", name: "Quenched steel", description: "A recurring image of tested resolve." }], error: null });
          }
          if (table === "timeline_notes") {
            return resolve({ data: [{ id: "timeline-1", note: "The first quenched blade is revealed.", sequence_order: 1 }], error: null });
          }
          return resolve({ data: [], error: null });
        },
      };
      return builder;
    }),
  };
}

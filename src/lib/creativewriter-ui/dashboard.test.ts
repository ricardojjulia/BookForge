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
    expect(result.readerComments).toHaveLength(1);
    expect(result.contributors).toMatchObject([
      {
        userId: "reader-1",
        role: "viewer",
        displayName: "Rae Reader",
      },
    ]);
    expect(result.participantProfiles).toMatchObject([
      {
        userId: "reader-1",
        displayName: "Rae Reader",
      },
    ]);
    expect(result.contributorSuggestions).toMatchObject([
      {
        id: "suggestion-1",
        paragraphId: "paragraph-1",
        status: "proposed",
        suggestedText: "Try a stronger closing image.",
      },
    ]);
    expect(result.contributorAssignments).toMatchObject([
      {
        id: "assignment-1",
        assigneeId: "reader-1",
        scope: "chapter",
        status: "assigned",
        title: "Review the opening.",
      },
    ]);
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

  it("projects scene-local paragraph numbers into chapter-wide CreativeWriter order", async () => {
    const supabase = createDashboardSupabase({
      sceneRows: [
        { id: "scene-2", chapter_id: "chapter-1", scene_number: 2 },
        { id: "scene-1", chapter_id: "chapter-1", scene_number: 1 },
      ],
      paragraphRows: [
        {
          id: "scene-2-paragraph-1",
          chapter_id: "chapter-1",
          scene_id: "scene-2",
          paragraph_number: 1,
          current_text: "Scene two first.",
          accepted_text: null,
          updated_at: "2026-08-02T12:00:00.000Z",
        },
        {
          id: "scene-1-paragraph-2",
          chapter_id: "chapter-1",
          scene_id: "scene-1",
          paragraph_number: 2,
          current_text: "Scene one second.",
          accepted_text: null,
          updated_at: "2026-08-02T12:00:00.000Z",
        },
        {
          id: "scene-1-paragraph-1",
          chapter_id: "chapter-1",
          scene_id: "scene-1",
          paragraph_number: 1,
          current_text: "Scene one first.",
          accepted_text: null,
          updated_at: "2026-08-02T12:00:00.000Z",
        },
      ],
    });

    const result = await getCreativeWriterWorkspaceData({ supabase, accountId: "user-1" });

    expect(result.paragraphs.map((paragraph) => paragraph.id)).toEqual(["scene-1-paragraph-1", "scene-1-paragraph-2", "scene-2-paragraph-1"]);
    expect(result.paragraphs.map((paragraph) => paragraph.paragraphNumber)).toEqual([1, 2, 3]);
    expect(result.paragraphs.map((paragraph) => paragraph.sourceParagraphNumber)).toEqual([1, 2, 1]);
  });

  it("carries the paragraph's original_text through to the workspace view", async () => {
    const supabase = createDashboardSupabase({
      paragraphRows: [
        {
          id: "paragraph-1",
          chapter_id: "chapter-1",
          scene_id: "scene-1",
          paragraph_number: 1,
          current_text: null,
          accepted_text: null,
          original_text: "Archived original text.",
          updated_at: "2026-08-02T12:00:00.000Z",
        },
      ],
    });

    const result = await getCreativeWriterWorkspaceData({ supabase, accountId: "user-1" });

    expect(result.paragraphs[0]?.originalText).toBe("Archived original text.");
  });
});

function createDashboardSupabase(options: { conflictError?: unknown; sceneRows?: unknown[]; paragraphRows?: unknown[] } = {}) {
  return {
    from: vi.fn((table: string) => {
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        in() {
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
          if (table === "scenes") {
            return resolve({
              data: options.sceneRows || [{ id: "scene-1", chapter_id: "chapter-1", scene_number: 1 }],
              error: null,
            });
          }
          if (table === "paragraphs") {
            return resolve({
              data: options.paragraphRows || [{ id: "paragraph-1", chapter_id: "chapter-1", scene_id: "scene-1", paragraph_number: 1, current_text: "Paragraph text.", accepted_text: null, updated_at: "2026-08-02T12:00:00.000Z" }],
              error: null,
            });
          }
          if (table === "reader_annotations") {
            return resolve({
              data: [
                {
                  id: "comment-1",
                  paragraph_id: "paragraph-1",
                  annotator_id: "reader-1",
                  note: "This line landed for me.",
                  resolved: false,
                  created_at: "2026-08-02T12:00:00.000Z",
                },
              ],
              error: null,
            });
          }
          if (table === "creativewriter_contributor_suggestions") {
            return resolve({
              data: [
                {
                  id: "suggestion-1",
                  chapter_id: "chapter-1",
                  paragraph_id: "paragraph-1",
                  proposer_id: "reader-1",
                  reviewer_id: null,
                  status: "proposed",
                  original_text_snapshot: "Paragraph text.",
                  suggested_text: "Try a stronger closing image.",
                  rationale: "More tactile.",
                  review_note: null,
                  created_at: "2026-08-02T12:05:00.000Z",
                  updated_at: "2026-08-02T12:05:00.000Z",
                  reviewed_at: null,
                  applied_at: null,
                  withdrawn_at: null,
                },
              ],
              error: null,
            });
          }
          if (table === "book_collaborators") {
            return resolve({
              data: [
                {
                  user_id: "reader-1",
                  role: "viewer",
                  created_at: "2026-08-02T11:55:00.000Z",
                },
              ],
              error: null,
            });
          }
          if (table === "creativewriter_contributor_assignments") {
            return resolve({
              data: [
                {
                  id: "assignment-1",
                  chapter_id: "chapter-1",
                  paragraph_id: null,
                  assignee_id: "reader-1",
                  assigner_id: "user-1",
                  scope: "chapter",
                  status: "assigned",
                  title: "Review the opening.",
                  note: "Watch continuity.",
                  due_at: "2026-08-10T12:00:00.000Z",
                  created_at: "2026-08-02T12:15:00.000Z",
                  updated_at: "2026-08-02T12:15:00.000Z",
                  completed_at: null,
                },
              ],
              error: null,
            });
          }
          if (table === "profiles") {
            return resolve({
              data: [
                {
                  id: "reader-1",
                  display_name: "Rae Reader",
                },
              ],
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

import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreativeWriterWorkspace } from "@/components/creativewriter/creativewriter-workspace";
import type { CreativeWriterWorkspaceData } from "@/lib/creativewriter-ui/dashboard";

const mockFetch = vi.fn<typeof fetch>();

function renderWorkspace(data = workspaceData()) {
  return render(
    <MantineProvider>
      <CreativeWriterWorkspace initialData={data} />
    </MantineProvider>,
  );
}

describe("CreativeWriterWorkspace", () => {
  afterEach(() => {
    cleanup();
    mockFetch.mockReset();
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("pushes the edited paragraph through the CreativeWriter sync API", async () => {
    stubBrowserLayoutApis();
    const user = userEvent.setup();
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          content: {
            project: workspaceData().project,
            appliedChanges: ["cw-ui-paragraph-1"],
            conflicts: [],
            rejectedChanges: [],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    renderWorkspace();

    await user.clear(screen.getByLabelText("CreativeWriter manuscript editor"));
    await user.type(screen.getByLabelText("CreativeWriter manuscript editor"), "A sharper paragraph.");
    await user.click(screen.getByRole("button", { name: "Push Draft" }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    const [, init] = mockFetch.mock.calls[0] || [];
    expect(String(mockFetch.mock.calls[0]?.[0])).toBe("/api/creativewriter/sync/push");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      project: { bookforgeBookId: "book-1", accountId: "user-1" },
      changes: [
        {
          entityType: "paragraph",
          entityId: "paragraph-1",
          operation: "update",
          payload: { currentText: "A sharper paragraph." },
        },
      ],
    });
    expect(await screen.findByText("Draft pushed to BookForge Cloud.")).toBeInTheDocument();
  });

  it("resolves an unresolved conflict from the side rail", async () => {
    stubBrowserLayoutApis();
    const user = userEvent.setup();
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          content: {
            conflictId: "conflict-change-1",
            resolutionStatus: "resolved_cloud",
            cloudVersion: 2,
            syncCursor: "book:book-1:version:2",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    renderWorkspace();

    await user.click(screen.getByRole("button", { name: "Keep Cloud" }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(String(mockFetch.mock.calls[0]?.[0])).toBe("/api/creativewriter/sync/resolve-conflict");
    const [, init] = mockFetch.mock.calls[0] || [];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      conflictId: "conflict-change-1",
      resolution: "resolved_cloud",
      project: { bookforgeBookId: "book-1", accountId: "user-1" },
    });
    expect(await screen.findByText("Conflict resolved in the cloud ledger.")).toBeInTheDocument();
  });

  it("sends edited manual merge text when applying a conflict merge", async () => {
    stubBrowserLayoutApis();
    const user = userEvent.setup();
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          content: {
            conflictId: "conflict-change-1",
            resolutionStatus: "resolved_manual",
            cloudVersion: 2,
            syncCursor: "book:book-1:version:2",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    renderWorkspace();

    expect(screen.getAllByText("Local paragraph.")).toHaveLength(2);
    expect(screen.getByText("Cloud paragraph.")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Manual merge for conflict-change-1"));
    await user.type(screen.getByLabelText("Manual merge for conflict-change-1"), "Merged paragraph.");
    await user.click(screen.getByRole("button", { name: "Apply Merge" }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    const [, init] = mockFetch.mock.calls[0] || [];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      conflictId: "conflict-change-1",
      resolution: "resolved_manual",
      resolvedPayload: { currentText: "Merged paragraph." },
    });
    expect(await screen.findByText("Conflict resolved in the cloud ledger.")).toBeInTheDocument();
  });

  it("merges pulled cloud paragraph changes into the active editor without a refresh", async () => {
    stubBrowserLayoutApis();
    const user = userEvent.setup();
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          content: {
            project: { ...workspaceData().project, syncCursor: "book:book-1:version:2", lastCloudVersion: 2 },
            changes: [
              {
                entityType: "paragraph",
                entityId: "paragraph-1",
                operation: "update",
                cloudVersion: 2,
                updatedAt: "2026-08-02T12:05:00.000Z",
                payload: {
                  chapterId: "chapter-1",
                  paragraphNumber: 1,
                  currentText: "Cloud paragraph after pull.",
                  acceptedText: null,
                },
              },
            ],
            conflicts: [],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    renderWorkspace();

    await user.click(screen.getByRole("button", { name: "Pull" }));

    expect(await screen.findByText("Pulled and merged 1 cloud changes.")).toBeInTheDocument();
    expect(screen.getByLabelText("CreativeWriter manuscript editor")).toHaveValue("Cloud paragraph after pull.");
  });

  it("blocks paragraph switching while the selected paragraph has an unsynced draft", async () => {
    stubBrowserLayoutApis();
    const user = userEvent.setup();

    renderWorkspace(workspaceData({ includeSecondParagraph: true, conflicts: [] }));

    await user.clear(screen.getByLabelText("CreativeWriter manuscript editor"));
    await user.type(screen.getByLabelText("CreativeWriter manuscript editor"), "Unsynced local paragraph.");
    await user.click(screen.getByRole("radio", { name: "2" }));

    expect(await screen.findByText("Push or discard the current draft before switching paragraphs.")).toBeInTheDocument();
    expect(screen.getByLabelText("CreativeWriter manuscript editor")).toHaveValue("Unsynced local paragraph.");

    await user.click(screen.getByRole("button", { name: "Discard" }));
    await user.click(screen.getByRole("radio", { name: "2" }));

    expect(screen.getByLabelText("CreativeWriter manuscript editor")).toHaveValue("Second paragraph.");
  });

  it("steps to the next paragraph across a chapter boundary with the chevron control", async () => {
    stubBrowserLayoutApis();
    const user = userEvent.setup();

    renderWorkspace(workspaceData({ includeSecondChapter: true, conflicts: [] }));

    expect(screen.getByRole("heading", { name: "Opening" })).toBeInTheDocument();
    expect(screen.getByLabelText("CreativeWriter manuscript editor")).toHaveValue("Original paragraph.");
    expect(screen.getByLabelText("Previous paragraph")).toBeDisabled();

    await user.click(screen.getByLabelText("Next paragraph"));

    expect(await screen.findByRole("heading", { name: "Rising Action" })).toBeInTheDocument();
    expect(screen.getByLabelText("CreativeWriter manuscript editor")).toHaveValue("First paragraph of the second chapter.");
    expect(screen.getByLabelText("Next paragraph")).toBeDisabled();

    await user.click(screen.getByLabelText("Previous paragraph"));

    expect(await screen.findByRole("heading", { name: "Opening" })).toBeInTheDocument();
    expect(screen.getByLabelText("CreativeWriter manuscript editor")).toHaveValue("Original paragraph.");
  });

  it("blocks stepping to the next paragraph while the selected paragraph has an unsynced draft", async () => {
    stubBrowserLayoutApis();
    const user = userEvent.setup();

    renderWorkspace(workspaceData({ includeSecondParagraph: true, conflicts: [] }));

    await user.type(screen.getByLabelText("CreativeWriter manuscript editor"), " Unsynced.");
    await user.click(screen.getByLabelText("Next paragraph"));

    expect(await screen.findByText("Push or discard the current draft before switching paragraphs.")).toBeInTheDocument();
    expect(screen.getByLabelText("CreativeWriter manuscript editor")).toHaveValue("Original paragraph. Unsynced.");
  });

  it("falls back to the paragraph's original text when current and accepted text are both empty", () => {
    stubBrowserLayoutApis();
    const data = workspaceData({ conflicts: [] });
    data.paragraphs[0] = {
      ...data.paragraphs[0],
      currentText: null,
      acceptedText: null,
      originalText: "Archived original text.",
    };

    renderWorkspace(data);

    expect(screen.getByLabelText("CreativeWriter manuscript editor")).toHaveValue("Archived original text.");
  });

  it("rehydrates the editor when route data changes to another selected book", async () => {
    stubBrowserLayoutApis();
    const { rerender } = renderWorkspace();

    expect(screen.getByLabelText("CreativeWriter manuscript editor")).toHaveValue("Original paragraph.");

    rerender(
      <MantineProvider>
        <CreativeWriterWorkspace initialData={workspaceData({ selectedBookId: "book-2", conflicts: [] })} />
      </MantineProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Second Opening" })).toBeInTheDocument();
    expect(screen.getByLabelText("CreativeWriter manuscript editor")).toHaveValue("Second book paragraph.");
  });

  it("links the selected book to Reader View beside the draft push action", () => {
    stubBrowserLayoutApis();

    renderWorkspace(workspaceData({ conflicts: [] }));

    expect(screen.getByRole("link", { name: "Reader View" })).toHaveAttribute(
      "href",
      "/books/book-1/read?returnTo=%2Fcreativewriter%3FbookId%3Dbook-1&returnLabel=Back%20to%20CreativeWriter",
    );
  });

  it("resizes and persists the CreativeWriter workspace columns", async () => {
    stubBrowserLayoutApis();

    renderWorkspace(workspaceData({ conflicts: [] }));

    fireEvent.keyDown(screen.getByRole("separator", { name: "Resize books panel" }), { key: "ArrowRight" });
    fireEvent.keyDown(screen.getByRole("separator", { name: "Resize support panel" }), { key: "ArrowLeft", shiftKey: true });

    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem("bookforge:creativewriter:workspace-layout") || "{}")).toMatchObject({
        left: 296,
        right: 360,
      });
    });
  });

  it("wraps support rail tabs instead of forcing horizontal scrolling", () => {
    stubBrowserLayoutApis();

    renderWorkspace(workspaceData({ conflicts: [] }));

    expect(screen.getByRole("tablist")).toHaveStyle({
      flexWrap: "wrap",
      overflow: "visible",
    });
    expect(screen.getByRole("tab", { name: /Book Bible/i })).toHaveStyle({
      flex: "1 1 116px",
      minWidth: "0",
    });
  });

  it("shows BookForge notes, research, bible, and separated world context for the selected book", async () => {
    stubBrowserLayoutApis();
    const user = userEvent.setup();

    renderWorkspace();

    await user.click(screen.getByRole("tab", { name: /Notes/i }));
    expect(screen.getByText("Keep the forge metaphor tactile.")).toBeInTheDocument();
    expect(screen.getByText("The first quenched blade is revealed.")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Research/i }));
    expect(screen.getByText("Smithing archive")).toBeInTheDocument();
    expect(screen.getByText("Historical notes on hand-forged tools.")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Book Bible/i }));
    expect(screen.getByText("Blueprint Summary")).toBeInTheDocument();
    expect(screen.getByText("A maker learns what must be reforged.")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Characters/i }));
    expect(screen.getByText("Mara Vale")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Locations/i }));
    expect(screen.getByText("The Old Foundry")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Themes/i }));
    expect(screen.getByText("Restoration")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Motifs/i }));
    expect(screen.getByText("Quenched steel")).toBeInTheDocument();
  });

  it("shows reader comments in the editor and contributor review queue", async () => {
    stubBrowserLayoutApis();
    const user = userEvent.setup();

    renderWorkspace(workspaceData({ conflicts: [] }));

    expect(screen.getByText("Comments on this paragraph")).toBeInTheDocument();
    expect(screen.getAllByText("This line landed for me.").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("tab", { name: /Comments/i }));

    expect(screen.getByText("Contributor review queue attached to the manuscript")).toBeInTheDocument();
    expect(screen.getByText("Paragraph 1")).toBeInTheDocument();
    expect(screen.getAllByText("This line landed for me.").length).toBeGreaterThan(0);
  });

  it("filters and resolves reader comments from the CreativeWriter review queue", async () => {
    stubBrowserLayoutApis();
    const user = userEvent.setup();
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ annotation: { id: "comment-1", resolved: true } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", mockFetch);

    renderWorkspace(workspaceData({ conflicts: [] }));

    await user.click(screen.getByRole("tab", { name: /Comments/i }));

    expect(screen.getByRole("radio", { name: "Open (1)" })).toBeChecked();
    expect(screen.getAllByText("This line landed for me.").length).toBeGreaterThan(0);
    expect(screen.queryByText("Already handled.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mark resolved" }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(String(mockFetch.mock.calls[0]?.[0])).toBe("/api/books/book-1/annotations/comment-1");
    expect(JSON.parse(String(mockFetch.mock.calls[0]?.[1]?.body))).toEqual({ resolved: true });
    expect(await screen.findByText("Reader comment marked resolved.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Open (0)" })).toBeChecked();
    expect(screen.getByText("No reader comments in this review queue.")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Resolved (2)" }));

    expect(screen.getAllByText("This line landed for me.").length).toBeGreaterThan(0);
    expect(screen.getByText("Already handled.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Reopen" })).toHaveLength(2);
  });

  it("creates contributor suggestions for the selected paragraph", async () => {
    stubBrowserLayoutApis();
    const user = userEvent.setup();
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          suggestion: {
            id: "suggestion-2",
            chapter_id: "chapter-1",
            paragraph_id: "paragraph-1",
            proposer_id: "user-1",
            reviewer_id: null,
            status: "proposed",
            original_text_snapshot: "Original paragraph.",
            suggested_text: "A better paragraph.",
            rationale: "Sharper.",
            review_note: null,
            created_at: "2026-08-02T12:20:00.000Z",
            updated_at: "2026-08-02T12:20:00.000Z",
            reviewed_at: null,
            applied_at: null,
            withdrawn_at: null,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    renderWorkspace(workspaceData({ conflicts: [] }));

    await user.click(screen.getByRole("tab", { name: /Suggestions/i }));
    await user.type(screen.getByLabelText("Suggested replacement text"), "A better paragraph.");
    await user.type(screen.getByLabelText("Suggestion rationale"), "Sharper.");
    await user.click(screen.getByRole("button", { name: "Propose Suggestion" }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(String(mockFetch.mock.calls[0]?.[0])).toBe("/api/books/book-1/suggestions");
    expect(JSON.parse(String(mockFetch.mock.calls[0]?.[1]?.body))).toMatchObject({
      chapterId: "chapter-1",
      paragraphId: "paragraph-1",
      originalTextSnapshot: "Original paragraph.",
      suggestedText: "A better paragraph.",
      rationale: "Sharper.",
    });
    expect(await screen.findByText("Contributor suggestion proposed.")).toBeInTheDocument();
    expect(screen.getByText("A better paragraph.")).toBeInTheDocument();
  });

  it("accepts contributor suggestions before explicitly applying them to the manuscript draft", async () => {
    stubBrowserLayoutApis();
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          suggestion: {
            id: "suggestion-1",
            status: "accepted",
            reviewer_id: "editor-1",
            review_note: null,
            updated_at: "2026-08-02T12:25:00.000Z",
            reviewed_at: "2026-08-02T12:25:00.000Z",
            applied_at: null,
            withdrawn_at: null,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          suggestion: {
            id: "suggestion-1",
            status: "applied",
            reviewer_id: "editor-1",
            review_note: null,
            updated_at: "2026-08-02T12:30:00.000Z",
            reviewed_at: "2026-08-02T12:25:00.000Z",
            applied_at: "2026-08-02T12:30:00.000Z",
            withdrawn_at: null,
          },
          paragraph: {
            id: "paragraph-1",
            currentText: "Try a more tactile sentence.",
            acceptedText: "Try a more tactile sentence.",
            updatedAt: "2026-08-02T12:30:00.000Z",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    renderWorkspace(workspaceData({ conflicts: [] }));

    await user.click(screen.getByRole("tab", { name: /Suggestions/i }));
    expect(screen.getByText("Contributor proposed manuscript changes")).toBeInTheDocument();
    expect(screen.getByText("Try a more tactile sentence.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(String(mockFetch.mock.calls[0]?.[0])).toBe("/api/books/book-1/suggestions/suggestion-1");
    expect(JSON.parse(String(mockFetch.mock.calls[0]?.[1]?.body))).toEqual({ status: "accepted" });
    expect(await screen.findByText("Contributor suggestion accepted.")).toBeInTheDocument();
    expect(screen.getByLabelText("CreativeWriter manuscript editor")).toHaveValue("Original paragraph.");

    await user.click(screen.getByRole("radio", { name: "Closed (1)" }));

    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.getByText("Try a more tactile sentence.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    expect(String(mockFetch.mock.calls[1]?.[0])).toBe("/api/books/book-1/suggestions/suggestion-1");
    expect(JSON.parse(String(mockFetch.mock.calls[1]?.[1]?.body))).toEqual({ status: "applied" });
    expect(await screen.findByText("Contributor suggestion applied.")).toBeInTheDocument();
    expect(screen.getByLabelText("CreativeWriter manuscript editor")).toHaveValue("Try a more tactile sentence.");
    expect(screen.getByText("Applied")).toBeInTheDocument();
  });

  it("shows stale suggestion context and applies a manual merge", async () => {
    stubBrowserLayoutApis();
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          suggestion: {
            id: "suggestion-1",
            status: "accepted",
            reviewer_id: "editor-1",
            review_note: null,
            updated_at: "2026-08-02T12:25:00.000Z",
            reviewed_at: "2026-08-02T12:25:00.000Z",
            applied_at: null,
            withdrawn_at: null,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: "Suggestion cannot be applied because the paragraph changed after it was proposed.",
          staleSuggestion: {
            suggestionId: "suggestion-1",
            paragraphId: "paragraph-1",
            originalTextSnapshot: "Original paragraph.",
            currentText: "Current changed paragraph.",
            suggestedText: "Try a more tactile sentence.",
            paragraphUpdatedAt: "2026-08-02T12:40:00.000Z",
          },
        }),
        { status: 409, headers: { "content-type": "application/json" } },
      ),
    ).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          suggestion: {
            id: "suggestion-1",
            status: "applied",
            reviewer_id: "editor-1",
            review_note: null,
            updated_at: "2026-08-02T12:45:00.000Z",
            reviewed_at: "2026-08-02T12:25:00.000Z",
            applied_at: "2026-08-02T12:45:00.000Z",
            withdrawn_at: null,
          },
          paragraph: {
            id: "paragraph-1",
            currentText: "Manual merged paragraph.",
            acceptedText: "Manual merged paragraph.",
            updatedAt: "2026-08-02T12:45:00.000Z",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    renderWorkspace(workspaceData({ conflicts: [] }));

    await user.click(screen.getByRole("tab", { name: /Suggestions/i }));
    await user.click(screen.getByRole("button", { name: "Accept" }));
    await screen.findByText("Contributor suggestion accepted.");
    await user.click(screen.getByRole("radio", { name: "Closed (1)" }));
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(await screen.findByText("Stale suggestion merge")).toBeInTheDocument();
    expect(screen.getAllByText("Needs manual merge").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Current changed paragraph.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Original paragraph.").length).toBeGreaterThan(0);

    await user.clear(screen.getByLabelText("Manual stale merge for suggestion-1"));
    await user.type(screen.getByLabelText("Manual stale merge for suggestion-1"), "Manual merged paragraph.");
    await user.click(screen.getByRole("button", { name: "Apply Manual Merge" }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));
    expect(JSON.parse(String(mockFetch.mock.calls[2]?.[1]?.body))).toEqual({
      status: "applied",
      mergedText: "Manual merged paragraph.",
    });
    expect(await screen.findByText("Contributor suggestion applied.")).toBeInTheDocument();
    expect(screen.getByLabelText("CreativeWriter manuscript editor")).toHaveValue("Manual merged paragraph.");
  });

  it("filters contributor suggestion queues and sends reviewer notes", async () => {
    stubBrowserLayoutApis();
    const user = userEvent.setup();
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          suggestion: {
            id: "suggestion-1",
            status: "accepted",
            reviewer_id: "user-1",
            review_note: "Use this in the next pass.",
            updated_at: "2026-08-02T12:25:00.000Z",
            reviewed_at: "2026-08-02T12:25:00.000Z",
            applied_at: null,
            withdrawn_at: null,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    renderWorkspace(workspaceData({ conflicts: [], includeOwnSuggestion: true, includeReviewedSuggestion: true }));

    await user.click(screen.getByRole("tab", { name: /Suggestions/i }));

    expect(screen.getByText("Proposed 2")).toBeInTheDocument();
    expect(screen.getByText("Accepted 1")).toBeInTheDocument();
    expect(screen.getAllByText("Applied 1").length).toBeGreaterThan(0);
    expect(screen.getByText("Contributors")).toBeInTheDocument();
    expect(screen.getByText("Rae Reader")).toBeInTheDocument();
    expect(screen.getByText("Viewer")).toBeInTheDocument();
    expect(screen.getByText("Author One")).toBeInTheDocument();
    expect(screen.getByText("Editor")).toBeInTheDocument();
    expect(screen.getByText("Active assignments 1")).toBeInTheDocument();
    expect(screen.getByText("Open comments 1")).toBeInTheDocument();
    expect(screen.getByText("Assignments")).toBeInTheDocument();
    expect(screen.getByText("Review the opening.")).toBeInTheDocument();
    expect(screen.getByText("Assigned")).toBeInTheDocument();
    expect(screen.getByText("Watch continuity.")).toBeInTheDocument();
    expect(screen.getByText("Recent Activity")).toBeInTheDocument();
    expect(screen.getByText("Applied suggestion")).toBeInTheDocument();
    expect(screen.getByText("Accepted suggestion")).toBeInTheDocument();
    expect(screen.getAllByText("Proposed suggestion").length).toBeGreaterThan(0);
    expect(screen.getByText("Approved earlier.")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("Try a more tactile sentence.")).toBeInTheDocument();
    expect(screen.getAllByText("My own suggestion.").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("radio", { name: "Mine" }));

    expect(screen.queryByText("Try a more tactile sentence.")).not.toBeInTheDocument();
    expect(screen.getAllByText("My own suggestion.").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("radio", { name: "Reviewed by me" }));
    await user.click(screen.getByRole("radio", { name: "Closed (2)" }));

    expect(screen.getAllByText("Already reviewed by me.").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Review note for suggestion-own")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "All" }));
    await user.click(screen.getByRole("radio", { name: "Proposed (2)" }));
    await user.type(screen.getAllByLabelText(/Review note for suggestion-1/)[0], "Use this in the next pass.");
    await user.click(screen.getAllByRole("button", { name: "Accept" })[0]);

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(mockFetch.mock.calls[0]?.[1]?.body))).toEqual({
      status: "accepted",
      reviewNote: "Use this in the next pass.",
    });
  });

  it("updates contributor assignment status from the assignment queue", async () => {
    stubBrowserLayoutApis();
    const user = userEvent.setup();
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          assignment: {
            id: "assignment-1",
            chapter_id: "chapter-1",
            paragraph_id: null,
            assignee_id: "reader-1",
            assigner_id: "user-1",
            scope: "chapter",
            status: "in_progress",
            title: "Review the opening.",
            note: "Watch continuity.",
            due_at: "2026-08-10T12:00:00.000Z",
            created_at: "2026-08-02T12:15:00.000Z",
            updated_at: "2026-08-02T12:20:00.000Z",
            completed_at: null,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    renderWorkspace(workspaceData({ conflicts: [] }));

    await user.click(screen.getByRole("tab", { name: /Suggestions/i }));
    await user.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(String(mockFetch.mock.calls[0]?.[0])).toBe("/api/books/book-1/assignments/assignment-1");
    expect(JSON.parse(String(mockFetch.mock.calls[0]?.[1]?.body))).toEqual({ status: "in_progress" });
    expect(await screen.findByText("Assignment started.")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
  });

  it("filters support context and pins selected entries per book", async () => {
    stubBrowserLayoutApis();
    const user = userEvent.setup();

    renderWorkspace();

    await user.click(screen.getByRole("tab", { name: /Characters/i }));
    await user.type(screen.getByLabelText("Search support context"), "Mara");

    expect(screen.getByText("Mara Vale")).toBeInTheDocument();
    expect(screen.queryByText("The Old Foundry")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Pin Mara Vale" }));

    expect(screen.getByRole("heading", { name: "Pinned Context", level: 3 })).toBeInTheDocument();
    expect(screen.getByText("This device")).toBeInTheDocument();
    expect(screen.getByLabelText("Pinned context is saved on this device only and does not sync across devices.")).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("bookforge:creativewriter:pinned-support:book-1") || "[]")).toEqual(["character:character-1"]);

    await user.click(screen.getByRole("button", { name: "Clear support search" }));

    expect(screen.getAllByText("Mara Vale")).toHaveLength(2);
    await user.click(screen.getByRole("tab", { name: /Locations/i }));
    expect(screen.getByText("The Old Foundry")).toBeInTheDocument();
  });
});

function stubBrowserLayoutApis() {
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });

  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}

      unobserve() {}

      disconnect() {}
    },
  );
}

function workspaceData(
  options: {
    includeSecondParagraph?: boolean;
    includeSecondChapter?: boolean;
    conflicts?: CreativeWriterWorkspaceData["conflicts"];
    selectedBookId?: "book-1" | "book-2";
    includeOwnSuggestion?: boolean;
    includeReviewedSuggestion?: boolean;
  } = {},
): CreativeWriterWorkspaceData {
  if (options.selectedBookId === "book-2") {
    return {
      accountId: "user-1",
      collaborationEnabled: true,
      books: [
        {
          id: "book-1",
          title: "The Forge",
          authorName: "Author",
          status: "draft",
          updatedAt: "2026-08-02T12:00:00.000Z",
        },
        {
          id: "book-2",
          title: "Second Forge",
          authorName: "Author",
          status: "draft",
          updatedAt: "2026-08-02T12:10:00.000Z",
        },
      ],
      selectedBook: {
        id: "book-2",
        title: "Second Forge",
        authorName: "Author",
        status: "draft",
        updatedAt: "2026-08-02T12:10:00.000Z",
      },
      chapters: [
        {
          id: "chapter-2",
          chapterNumber: 1,
          title: "Second Opening",
          summary: null,
          currentText: "Second chapter text.",
          updatedAt: "2026-08-02T12:10:00.000Z",
        },
      ],
      paragraphs: [
        {
          id: "paragraph-3",
          chapterId: "chapter-2",
          sceneId: "scene-2",
          sceneNumber: 1,
          paragraphNumber: 1,
          sourceParagraphNumber: 1,
          currentText: "Second book paragraph.",
          acceptedText: null,
          originalText: null,
          updatedAt: "2026-08-02T12:10:00.000Z",
        },
      ],
      readerComments: [],
      contributorSuggestions: [],
      contributors: [],
      participantProfiles: [],
      contributorAssignments: [],
      conflicts: options.conflicts ?? [],
      support: emptySupport(),
      project: {
        localProjectId: "web-book-2",
        accountId: "user-1",
        bookforgeBookId: "book-2",
        syncCursor: "book:book-2:version:2",
        lastCloudVersion: 2,
        linkedAt: "2026-08-02T12:10:00.000Z",
      },
    };
  }

  const paragraphs: CreativeWriterWorkspaceData["paragraphs"] = [
    {
      id: "paragraph-1",
      chapterId: "chapter-1",
      sceneId: "scene-1",
      sceneNumber: 1,
      paragraphNumber: 1,
      sourceParagraphNumber: 1,
      currentText: "Original paragraph.",
      acceptedText: null,
      originalText: null,
      updatedAt: "2026-08-02T12:00:00.000Z",
    },
  ];
  if (options.includeSecondParagraph) {
    paragraphs.push({
      id: "paragraph-2",
      chapterId: "chapter-1",
      sceneId: "scene-1",
      sceneNumber: 1,
      paragraphNumber: 2,
      sourceParagraphNumber: 2,
      currentText: "Second paragraph.",
      acceptedText: null,
      originalText: null,
      updatedAt: "2026-08-02T12:00:00.000Z",
    });
  }
  if (options.includeSecondChapter) {
    paragraphs.push({
      id: "paragraph-2b",
      chapterId: "chapter-1b",
      sceneId: "scene-1b",
      sceneNumber: 1,
      paragraphNumber: 1,
      sourceParagraphNumber: 1,
      currentText: "First paragraph of the second chapter.",
      acceptedText: null,
      originalText: null,
      updatedAt: "2026-08-02T12:00:00.000Z",
    });
  }

  const contributorSuggestions: CreativeWriterWorkspaceData["contributorSuggestions"] = [
    {
      id: "suggestion-1",
      chapterId: "chapter-1",
      paragraphId: "paragraph-1",
      proposerId: "reader-1",
      reviewerId: null,
      status: "proposed",
      originalTextSnapshot: "Original paragraph.",
      suggestedText: "Try a more tactile sentence.",
      rationale: "It better matches the book voice.",
      reviewNote: null,
      createdAt: "2026-08-02T12:10:00.000Z",
      updatedAt: "2026-08-02T12:10:00.000Z",
      reviewedAt: null,
      appliedAt: null,
      withdrawnAt: null,
    },
  ];
  if (options.includeOwnSuggestion) {
    contributorSuggestions.push({
      id: "suggestion-own",
      chapterId: "chapter-1",
      paragraphId: "paragraph-1",
      proposerId: "user-1",
      reviewerId: null,
      status: "proposed",
      originalTextSnapshot: "Original paragraph.",
      suggestedText: "My own suggestion.",
      rationale: null,
      reviewNote: null,
      createdAt: "2026-08-02T12:12:00.000Z",
      updatedAt: "2026-08-02T12:12:00.000Z",
      reviewedAt: null,
      appliedAt: null,
      withdrawnAt: null,
    });
  }
  if (options.includeReviewedSuggestion) {
    contributorSuggestions.push(
      {
        id: "suggestion-reviewed",
        chapterId: "chapter-1",
        paragraphId: "paragraph-1",
        proposerId: "reader-2",
        reviewerId: "user-1",
        status: "accepted",
        originalTextSnapshot: "Original paragraph.",
        suggestedText: "Already reviewed by me.",
        rationale: null,
        reviewNote: "Approved earlier.",
        createdAt: "2026-08-02T12:13:00.000Z",
        updatedAt: "2026-08-02T12:14:00.000Z",
        reviewedAt: "2026-08-02T12:14:00.000Z",
        appliedAt: null,
        withdrawnAt: null,
      },
      {
        id: "suggestion-applied",
        chapterId: "chapter-1",
        paragraphId: "paragraph-1",
        proposerId: "reader-3",
        reviewerId: "user-1",
        status: "applied",
        originalTextSnapshot: "Original paragraph.",
        suggestedText: "Already applied by me.",
        rationale: null,
        reviewNote: null,
        createdAt: "2026-08-02T12:15:00.000Z",
        updatedAt: "2026-08-02T12:16:00.000Z",
        reviewedAt: "2026-08-02T12:16:00.000Z",
        appliedAt: "2026-08-02T12:16:00.000Z",
        withdrawnAt: null,
      },
    );
  }

  return {
    accountId: "user-1",
    collaborationEnabled: true,
    books: [
      {
        id: "book-1",
        title: "The Forge",
        authorName: "Author",
        status: "draft",
        updatedAt: "2026-08-02T12:00:00.000Z",
      },
    ],
    selectedBook: {
      id: "book-1",
      title: "The Forge",
      authorName: "Author",
      status: "draft",
      updatedAt: "2026-08-02T12:00:00.000Z",
    },
    chapters: [
      {
        id: "chapter-1",
        chapterNumber: 1,
        title: "Opening",
        summary: null,
        currentText: "Chapter text.",
        updatedAt: "2026-08-02T12:00:00.000Z",
      },
      ...(options.includeSecondChapter
        ? [
            {
              id: "chapter-1b",
              chapterNumber: 2,
              title: "Rising Action",
              summary: null,
              currentText: "Second chapter text.",
              updatedAt: "2026-08-02T12:00:00.000Z",
            },
          ]
        : []),
    ],
    paragraphs,
    readerComments: [
      {
        id: "comment-1",
        paragraphId: "paragraph-1",
        annotatorId: "reader-1",
        note: "This line landed for me.",
        resolved: false,
        createdAt: "2026-08-02T12:00:00.000Z",
      },
      {
        id: "comment-2",
        paragraphId: null,
        annotatorId: "reader-1",
        note: "Already handled.",
        resolved: true,
        createdAt: "2026-08-02T12:05:00.000Z",
      },
    ],
    contributorSuggestions,
    contributors: [
      {
        userId: "reader-1",
        role: "viewer",
        displayName: "Rae Reader",
        email: "rae@example.com",
        joinedAt: "2026-08-02T11:55:00.000Z",
      },
      {
        userId: "user-1",
        role: "editor",
        displayName: "Author One",
        email: "author@example.com",
        joinedAt: "2026-08-02T11:50:00.000Z",
      },
    ],
    participantProfiles: [
      {
        userId: "reader-1",
        displayName: "Rae Reader",
      },
      {
        userId: "user-1",
        displayName: "Author One",
      },
    ],
    contributorAssignments: [
      {
        id: "assignment-1",
        chapterId: "chapter-1",
        paragraphId: null,
        assigneeId: "reader-1",
        assignerId: "user-1",
        scope: "chapter",
        status: "assigned",
        title: "Review the opening.",
        note: "Watch continuity.",
        dueAt: "2026-08-10T12:00:00.000Z",
        createdAt: "2026-08-02T12:15:00.000Z",
        updatedAt: "2026-08-02T12:15:00.000Z",
        completedAt: null,
      },
    ],
    conflicts: options.conflicts ?? [
      {
        id: "conflict-change-1",
        eventId: "event-1",
        projectId: "web-book-1",
        entityType: "paragraph",
        entityId: "paragraph-1",
        conflictType: "content",
        baseVersion: 1,
        localPayload: { currentText: "Local paragraph." },
        cloudPayload: { currentText: "Cloud paragraph." },
        resolutionStatus: "unresolved",
        createdAt: "2026-08-02T12:00:00.000Z",
      },
    ],
    support: {
      authorNotes: {
        creativeInstructions: "Keep the forge metaphor tactile.",
        voiceGuidance: "Plainspoken, precise, and warm.",
        worldviewNotes: "Craft carries responsibility.",
        theologicalAlignment: "Honor conscience without sermonizing.",
        forbiddenChanges: "Do not rename the central forge.",
        updatedAt: "2026-08-02T12:00:00.000Z",
      },
      references: [
        {
          id: "reference-1",
          title: "Smithing archive",
          materialType: "research",
          content: "Historical notes on hand-forged tools.",
          includeInPrompts: true,
          createdAt: "2026-08-02T12:00:00.000Z",
        },
      ],
      bible: {
        content: { summary: "A maker learns what must be reforged." },
        updatedAt: "2026-08-02T12:00:00.000Z",
        characters: [
          {
            id: "character-1",
            name: "Mara Vale",
            description: "A careful apprentice.",
            detail: "protagonist",
          },
        ],
        locations: [
          {
            id: "location-1",
            name: "The Old Foundry",
            description: "A working forge below the hill.",
            detail: null,
          },
        ],
        themes: [
          {
            id: "theme-1",
            name: "Restoration",
            description: "Broken tools can carry new service.",
            detail: null,
          },
        ],
        motifs: [
          {
            id: "motif-1",
            name: "Quenched steel",
            description: "A recurring image of tested resolve.",
            detail: null,
          },
        ],
        timeline: [
          {
            id: "timeline-1",
            note: "The first quenched blade is revealed.",
            sequenceOrder: 1,
            detail: "Chapter 1",
          },
        ],
      },
    },
    project: {
      localProjectId: "web-book-1",
      accountId: "user-1",
      bookforgeBookId: "book-1",
      syncCursor: "book:book-1:version:1",
      lastCloudVersion: 1,
      linkedAt: "2026-08-02T12:00:00.000Z",
    },
  };
}

function emptySupport(): CreativeWriterWorkspaceData["support"] {
  return {
    authorNotes: null,
    references: [],
    bible: {
      content: null,
      updatedAt: null,
      characters: [],
      locations: [],
      themes: [],
      motifs: [],
      timeline: [],
    },
  };
}

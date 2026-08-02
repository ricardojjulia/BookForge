import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorldBibleEditor } from "@/components/books/world/world-bible-editor";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

function renderEditor() {
  return render(
    <MantineProvider>
      <WorldBibleEditor
        bookId="book-1"
        initialCharacters={[]}
        initialLocations={[]}
        initialThemes={[]}
        initialMotifs={[]}
        initialTimeline={[]}
        chapters={[]}
        discoveryStatus="not_started"
        discoveryProcessed={false}
        discoveryProcessedAt={null}
      />
    </MantineProvider>,
  );
}

describe("WorldBibleEditor discovery", () => {
  beforeEach(() => {
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });

  afterEach(() => {
    cleanup();
    refreshMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("queues discovery, dispatches the worker, and refreshes completed results", async () => {
    const requests: RequestInit[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      requests.push(init || {});
      const body = JSON.parse(String(init?.body || "{}")) as { serverManaged?: boolean; jobId?: string };
      const response = body.serverManaged
        ? { content: { jobId: "11111111-1111-4111-8111-111111111111" } }
        : { content: { worldDiscoveryResult: { inserted: { characters: 1 } } } };
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "Discover with AI" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(requests[0].body))).toMatchObject({ serverManaged: true, discoverWorldBible: true });
    expect(JSON.parse(String(requests[1].body))).toMatchObject({
      jobId: "11111111-1111-4111-8111-111111111111",
      discoverWorldBible: true,
    });
    await waitFor(() => {
      expect(screen.getByText("World Bible discovery completed.")).toBeInTheDocument();
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });
  });

  it("shows a queue failure inline", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ error: "Extraction model unavailable" }),
      { status: 503, headers: { "content-type": "application/json" } },
    )));

    renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "Discover with AI" }));

    expect(await screen.findByText("Extraction model unavailable")).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});

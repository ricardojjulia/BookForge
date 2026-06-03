import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutoReviewWizard } from "@/components/books/auto-review/auto-review-wizard";

const mockFetch = vi.fn<typeof fetch>();

function renderWizard() {
  return render(
    <MantineProvider>
      <AutoReviewWizard bookId="book-1" bookTitle="My Book" />
    </MantineProvider>,
  );
}

describe("AutoReviewWizard", () => {
  afterEach(() => {
    cleanup();
    mockFetch.mockReset();
    vi.unstubAllGlobals();
  });

  it("shows inline error when queued auto-review start fails", async () => {
    mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/auto-review") && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ job: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/auto-review") && init?.method === "POST") {
        return new Response(JSON.stringify({ error: "Queue unavailable" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    vi.stubGlobal("fetch", mockFetch);

    renderWizard();

    await userEvent.click(screen.getByRole("button", { name: "Auto-Review Wizard" }));
    await screen.findByText("Full autonomous review cycle");
    await userEvent.click(screen.getByText("Full autonomous review cycle"));
    await userEvent.click(screen.getByRole("button", { name: /Start/i }));

    await waitFor(() => {
      expect(screen.getByText("Unable to start auto-review")).toBeInTheDocument();
      expect(screen.getByText("Queue unavailable")).toBeInTheDocument();
    });
  });

  it("shows inline error when launch handshake fails", async () => {
    mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/auto-review") && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ job: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/auto-review") && init?.method === "POST") {
        return new Response(JSON.stringify({ content: { jobId: "11111111-1111-4111-8111-111111111111" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/auto-review/process") && init?.method === "POST" && String(init.body).includes("\"launchOnly\":true")) {
        return new Response(JSON.stringify({ error: "Launch handshake failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    vi.stubGlobal("fetch", mockFetch);

    renderWizard();

    await userEvent.click(screen.getByRole("button", { name: "Auto-Review Wizard" }));
    await screen.findByText("Full autonomous review cycle");
    await userEvent.click(screen.getByText("Full autonomous review cycle"));
    await userEvent.click(screen.getByRole("button", { name: /Start/i }));

    await waitFor(() => {
      expect(screen.getByText("Unable to start auto-review")).toBeInTheDocument();
      expect(screen.getByText("Launch handshake failed")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /Start/i })).toBeInTheDocument();
    const processCalls = mockFetch.mock.calls.filter(
      ([requestInput]) => String(requestInput).endsWith("/auto-review/process"),
    );
    expect(processCalls).toHaveLength(1);
  });

  it("shows inline error when resumable launch handshake fails", async () => {
    mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/auto-review") && (!init || init.method === undefined)) {
        return new Response(
          JSON.stringify({
            job: {
              id: "33333333-3333-4333-8333-333333333333",
              mode: "full_review",
              status: "failed",
              stages_completed: ["analyze", "summarize"],
              error: "Transient failure",
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/auto-review") && init?.method === "POST") {
        return new Response(JSON.stringify({ content: { jobId: "33333333-3333-4333-8333-333333333333" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/auto-review/process") && init?.method === "POST" && String(init.body).includes("\"launchOnly\":true")) {
        return new Response(JSON.stringify({ error: "Resume handshake failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    vi.stubGlobal("fetch", mockFetch);

    renderWizard();

    await userEvent.click(screen.getByRole("button", { name: "Auto-Review Wizard" }));
    await screen.findByText("Previous run can be resumed");
    await userEvent.click(screen.getByRole("button", { name: /Resume/i }));

    await waitFor(() => {
      expect(screen.getByText("Unable to start auto-review")).toBeInTheDocument();
      expect(screen.getByText("Resume handshake failed")).toBeInTheDocument();
    });

    const autoReviewStartCalls = mockFetch.mock.calls.filter(
      ([requestInput, requestInit]) =>
        String(requestInput).endsWith("/auto-review") && requestInit?.method === "POST",
    );
    expect(autoReviewStartCalls).toHaveLength(1);
    const startPayload = JSON.parse(String(autoReviewStartCalls[0][1]?.body)) as { jobId?: string };
    expect(startPayload.jobId).toBe("33333333-3333-4333-8333-333333333333");

    const processCalls = mockFetch.mock.calls.filter(
      ([requestInput]) => String(requestInput).endsWith("/auto-review/process"),
    );
    expect(processCalls).toHaveLength(1);
  });
});

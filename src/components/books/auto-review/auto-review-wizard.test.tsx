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
});

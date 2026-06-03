import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutoReviewWizard } from "@/components/books/auto-review/auto-review-wizard";

vi.mock("@/components/books/auto-review/auto-review-runner", () => ({
  AutoReviewRunner: () => null,
}));

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

  it("reuses the same launch token for handshake and worker launch", async () => {
    const launchToken = "44444444-4444-4444-8444-444444444444";
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => launchToken) });

    mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/auto-review") && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ job: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/auto-review") && init?.method === "POST") {
        return new Response(JSON.stringify({ content: { jobId: "55555555-5555-4555-8555-555555555555" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/auto-review/process") && init?.method === "POST") {
        return new Response(JSON.stringify({ ok: true, accepted: true }), {
          status: 200,
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
      const processCalls = mockFetch.mock.calls.filter(
        ([requestInput]) => String(requestInput).endsWith("/auto-review/process"),
      );
      expect(processCalls).toHaveLength(2);
    });

    const processCalls = mockFetch.mock.calls.filter(
      ([requestInput]) => String(requestInput).endsWith("/auto-review/process"),
    );

    const handshakePayload = JSON.parse(String(processCalls[0][1]?.body)) as {
      launchOnly?: boolean;
      launchToken?: string;
    };
    const workerPayload = JSON.parse(String(processCalls[1][1]?.body)) as {
      launchOnly?: boolean;
      launchToken?: string;
    };

    expect(handshakePayload.launchOnly).toBe(true);
    expect(handshakePayload.launchToken).toBe(launchToken);
    expect(workerPayload.launchOnly).toBeUndefined();
    expect(workerPayload.launchToken).toBe(launchToken);
  });

  it("reuses the same launch token for resumable handshake and worker launch", async () => {
    const launchToken = "66666666-6666-4666-8666-666666666666";
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => launchToken) });

    mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/auto-review") && (!init || init.method === undefined)) {
        return new Response(
          JSON.stringify({
            job: {
              id: "77777777-7777-4777-8777-777777777777",
              mode: "full_review",
              status: "failed",
              stages_completed: ["analyze"],
              error: "Needs resume",
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/auto-review") && init?.method === "POST") {
        return new Response(JSON.stringify({ content: { jobId: "77777777-7777-4777-8777-777777777777" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/auto-review/process") && init?.method === "POST") {
        return new Response(JSON.stringify({ ok: true, accepted: true }), {
          status: 200,
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
      const processCalls = mockFetch.mock.calls.filter(
        ([requestInput]) => String(requestInput).endsWith("/auto-review/process"),
      );
      expect(processCalls).toHaveLength(2);
    });

    const autoReviewStartCalls = mockFetch.mock.calls.filter(
      ([requestInput, requestInit]) =>
        String(requestInput).endsWith("/auto-review") && requestInit?.method === "POST",
    );
    expect(autoReviewStartCalls).toHaveLength(1);
    const startPayload = JSON.parse(String(autoReviewStartCalls[0][1]?.body)) as { jobId?: string };
    expect(startPayload.jobId).toBe("77777777-7777-4777-8777-777777777777");

    const processCalls = mockFetch.mock.calls.filter(
      ([requestInput]) => String(requestInput).endsWith("/auto-review/process"),
    );

    const handshakePayload = JSON.parse(String(processCalls[0][1]?.body)) as {
      launchOnly?: boolean;
      launchToken?: string;
      jobId?: string;
    };
    const workerPayload = JSON.parse(String(processCalls[1][1]?.body)) as {
      launchOnly?: boolean;
      launchToken?: string;
      jobId?: string;
    };

    expect(handshakePayload.launchOnly).toBe(true);
    expect(handshakePayload.launchToken).toBe(launchToken);
    expect(handshakePayload.jobId).toBe("77777777-7777-4777-8777-777777777777");
    expect(workerPayload.launchOnly).toBeUndefined();
    expect(workerPayload.launchToken).toBe(launchToken);
    expect(workerPayload.jobId).toBe("77777777-7777-4777-8777-777777777777");
  });
});

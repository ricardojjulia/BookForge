import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardMetrics } from "@/components/dashboard/dashboard-metrics";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe("DashboardMetrics", () => {
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
    pushMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("links books and AI settings to their destinations", () => {
    renderMetrics();

    expect(screen.getByRole("link", { name: /3 books/ })).toHaveAttribute("href", "#books");
    expect(screen.getByRole("link", { name: /LM Studio AI engine/ })).toHaveAttribute("href", "/settings");
  });

  it("requires a book choice before opening critic reports", async () => {
    const user = userEvent.setup();
    renderMetrics();

    await user.click(screen.getByRole("button", { name: /6 critic reports/ }));
    const viewReports = await screen.findByRole("button", { name: "View critic reports" });
    expect(viewReports).toBeDisabled();

    await user.click(screen.getByRole("combobox", { name: "Book" }));
    await user.click(await screen.findByRole("option", { name: "The Forge" }));
    await user.click(viewReports);

    expect(pushMock).toHaveBeenCalledWith("/books/book-1#critic-reports");
  });
});

function renderMetrics() {
  return render(
    <MantineProvider>
      <DashboardMetrics
        bookCount={3}
        reportCount={6}
        aiEngine="LM Studio"
        books={[{ id: "book-1", title: "The Forge" }]}
      />
    </MantineProvider>,
  );
}

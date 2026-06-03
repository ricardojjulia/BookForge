import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import type { ChangeEvent } from "react";
import { FinalManuscriptBuilder } from "@/components/books/export/final-manuscript-builder";
import { fetchJson } from "@/lib/http/fetch-json";

const { refreshMock, confirmMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  confirmMock: vi.fn(() => true),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("@mantine/core", async () => {
  const actual = await vi.importActual<typeof import("@mantine/core")>("@mantine/core");
  return {
    ...actual,
    Textarea: ({ label, value, onChange, readOnly }: { label?: string; value?: string; onChange?: (event: ChangeEvent<HTMLTextAreaElement>) => void; readOnly?: boolean }) => (
      <textarea aria-label={label} value={value} onChange={onChange} readOnly={readOnly} />
    ),
  };
});

vi.mock("@/lib/http/fetch-json", () => ({
  fetchJson: vi.fn(async () => ({
    content: {
      exportId: "exp-1",
      signedUrl: "https://signed",
      sourceMode: "accepted",
      paragraphCount: 20,
      chapterCount: 2,
    },
  })),
}));

function renderBuilder(initialDefaults?: Parameters<typeof FinalManuscriptBuilder>[0]["initialDefaults"]) {
  return render(
    <MantineProvider>
      <FinalManuscriptBuilder
        bookId="book-1"
        acceptedParagraphs={98}
        totalParagraphs={100}
        lockedParagraphs={2}
        pendingDraftCount={0}
        initialDefaults={initialDefaults}
      />
    </MantineProvider>,
  );
}

describe("FinalManuscriptBuilder", () => {
  beforeEach(() => {
    cleanup();
    refreshMock.mockReset();
    vi.mocked(fetchJson).mockClear();
  });

  it("prefills from latest defaults and supports reset + reapply", async () => {
    const user = userEvent.setup();
    const initialDefaults = {
      format: "epub",
      sourceMode: "latest",
      includeFrontMatter: false,
      includeBackMatter: false,
      useOriginalForLocked: false,
      abridgedMode: true,
      epubMetadata: {
        language: "en-US",
        publisher: "Preset Publisher",
        copyright: "Preset Copyright",
        description: "Preset Description",
      },
      pdfOptions: {
        fontSize: 12,
        lineGap: 2,
        pageNumbers: false,
        pageSize: "A4" as const,
      },
    };

    renderBuilder(initialDefaults);

    const publisherInput = screen.getByLabelText("Publisher") as HTMLInputElement;
    const languageInput = screen.getByLabelText("Language") as HTMLInputElement;
    expect(publisherInput.value).toBe("Preset Publisher");
    expect(languageInput.value).toBe("en-US");

    await user.clear(publisherInput);
    await user.type(publisherInput, "Changed Publisher");

    await user.click(screen.getByRole("button", { name: "Reset to recommended defaults" }));

    expect((screen.getByLabelText("Include front matter") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Include back matter") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Build abridged edition from approved cuts") as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByLabelText("Language")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Publisher")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Use last export settings" }));

    expect((screen.getByLabelText("Language") as HTMLInputElement).value).toBe("en-US");
    expect((screen.getByLabelText("Publisher") as HTMLInputElement).value).toBe("Preset Publisher");
    expect((screen.getByLabelText("Include front matter") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText("Build abridged edition from approved cuts") as HTMLInputElement).checked).toBe(true);
  });

  it("blocks submit for invalid EPUB language and normalizes metadata before submit", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("confirm", confirmMock);
    const fetchJsonMock = vi.mocked(fetchJson);
    fetchJsonMock.mockClear();

    renderBuilder({
      format: "epub",
      epubMetadata: {
        language: "english",
        publisher: "",
      },
    });

    await user.click(screen.getByRole("button", { name: "Build EPUB" }));
    expect(screen.getByText("EPUB language must use BCP-47 short form like 'en' or 'en-US'.")).toBeInTheDocument();
    expect(fetchJsonMock).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("Language"));
    await user.type(screen.getByLabelText("Language"), " en-US ");
    await user.clear(screen.getByLabelText("Publisher"));
    await user.type(screen.getByLabelText("Publisher"), "  Acme Press  ");

    await user.click(screen.getByRole("button", { name: "Build EPUB" }));

    expect(fetchJsonMock).toHaveBeenCalled();
    const [, init] = fetchJsonMock.mock.calls[0] as [string, RequestInit, string];
    const body = JSON.parse(String(init.body));
    expect(body.epubMetadata.language).toBe("en-US");
    expect(body.epubMetadata.publisher).toBe("Acme Press");
  });
});

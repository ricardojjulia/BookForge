export const CHECKLIST_DISMISSED_STEP = "getting_started_dismissed";

export type OnboardingChecklistItem = {
  key: string;
  label: string;
  done: boolean;
  ctaLabel: string;
  ctaHref: string;
};

export function buildOnboardingChecklist(input: {
  aiConfigured: boolean;
  hasBook: boolean;
  hasCriticReport: boolean;
  hasAcceptedParagraph: boolean;
  hasExport: boolean;
  // Most-recently-updated book, if any -- lets the remaining steps deep-link
  // straight into that book's Studio instead of a same-page "#books" anchor.
  // That anchor never actually scrolled: Next.js's router treats a link to
  // the current pathname (already on /dashboard) as a no-op, so the CTA
  // looked and felt broken even though the href itself was well-formed.
  latestBookId?: string | null;
}): OnboardingChecklistItem[] {
  const openStudioHref = input.latestBookId ? `/books/${input.latestBookId}/studio` : "/dashboard#books";
  return [
    {
      key: "ai_configured",
      label: "Connect an AI engine",
      done: input.aiConfigured,
      ctaLabel: "Open settings",
      ctaHref: "/settings",
    },
    {
      key: "book_created",
      label: "Create or import your first book",
      done: input.hasBook,
      ctaLabel: "Create a book",
      ctaHref: "/books/create",
    },
    {
      key: "critic_run",
      label: "Run BookForge Critic on a book",
      done: input.hasCriticReport,
      ctaLabel: "Open Studio",
      ctaHref: openStudioHref,
    },
    {
      key: "rewrite_accepted",
      label: "Accept a rewritten paragraph",
      done: input.hasAcceptedParagraph,
      ctaLabel: "Open Studio",
      ctaHref: openStudioHref,
    },
    {
      key: "export_made",
      label: "Export a finished manuscript",
      done: input.hasExport,
      ctaLabel: "Open Studio",
      ctaHref: openStudioHref,
    },
  ];
}

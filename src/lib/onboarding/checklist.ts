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
}): OnboardingChecklistItem[] {
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
      ctaLabel: "Open a book",
      ctaHref: "/dashboard#books",
    },
    {
      key: "rewrite_accepted",
      label: "Accept a rewritten paragraph",
      done: input.hasAcceptedParagraph,
      ctaLabel: "Open a book",
      ctaHref: "/dashboard#books",
    },
    {
      key: "export_made",
      label: "Export a finished manuscript",
      done: input.hasExport,
      ctaLabel: "Open a book",
      ctaHref: "/dashboard#books",
    },
  ];
}

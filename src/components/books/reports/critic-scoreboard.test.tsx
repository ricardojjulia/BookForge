import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { CriticScoreboard } from "@/components/books/reports/critic-scoreboard";

// Regression test: the "N saved" badge previously counted every
// coherence_reports row passed in (rewrite_execution, rewrite_plan, drift
// checks, etc.), not just critic ones -- so a book with 16 real critic
// reports plus 5 unrelated report rows showed "21 saved".
describe("CriticScoreboard", () => {
  it("only counts critic-type reports in the 'saved' badge, ignoring other report types", () => {
    const reports = [
      { id: "1", report_type: "critic:story_structure", created_at: "2026-08-04T00:00:00Z", content: { score: 75 } },
      { id: "2", report_type: "critic_post:story_structure", created_at: "2026-08-04T01:00:00Z", content: { score: 80 } },
      { id: "3", report_type: "rewrite_execution", created_at: "2026-08-04T02:00:00Z", content: {} },
      { id: "4", report_type: "rewrite_plan", created_at: "2026-08-04T02:30:00Z", content: {} },
      { id: "5", report_type: "auto_revision_decisions", created_at: "2026-08-04T03:00:00Z", content: {} },
      { id: "6", report_type: "rewrite_drift_check", created_at: "2026-08-04T03:30:00Z", content: {} },
    ];

    render(
      <MantineProvider>
        <CriticScoreboard reports={reports} />
      </MantineProvider>,
    );

    expect(screen.getByText("2 saved")).toBeTruthy();
  });
});

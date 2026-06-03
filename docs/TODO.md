# Engineering TODO

Last updated: 2026-06-02

## v0.3.0 Plan

### Phase 0 — Scope Lock

- Define release goals, non-goals, and acceptance criteria.
- Freeze the first release slice and the rollback boundary.

### Phase 1 — Operational Maturity

- [x] Add persistent heartbeats for long-running AI workflows.
- [x] Add rewrite-executor heartbeats for long-running AI workflows.
- [x] Add auto-review worker route for durable background processing.
- [x] Split planned draft generation into queue + worker handoff.
- [x] Split chapter summaries into queue + worker handoff.
- [x] Split Manuscript Blueprint generation into queue + worker handoff.
- [x] Split Critic batch generation into queue + worker handoff.
- [x] Convert single-lens Critic route to queue + worker handoff.
- [x] Convert Rewrite Architect planning route to queue + worker handoff.
- [x] Convert rewrite drift-check route to queue + worker handoff.
- [x] Convert voice-capture route to queue + worker handoff.
- [x] Convert auto-revision route to queue + worker handoff.
- [x] Convert auto-review start flow to queue handoff + true job resume.
- [x] Add idempotent auto-review process launch handshake (`launchToken` + `launchOnly`).
- [x] Split rewrite execution (main panel) into queue + worker handoff.
- [x] Move rewrite-related UI callers to queue handoff (guidance/review/jobs panel).
- [x] Convert Publishing Lab run to queue + worker handoff.
- Design durable background processing for the remaining long-running AI workflows.
- [x] Add a job-history screen so users can inspect queued, running, and completed work.
- Establish the retry, cancellation, and visibility policy for those jobs.

### Phase 2 — Product Quality

- [x] Persist and prefill export metadata/style controls from latest export.
- [x] Refine export styling and metadata controls.
- [x] Improve collaborator workflows where they still require manual coordination.
- [x] Expand tests around export assembly and review-assignment/approval workflows.
- [x] Expand tests around parsing and rewrite planning math.

## Prior Cycle: Reliability and Freshness

- [x] Rebuild `docs/ARCHITECTURE.md` to remove corrupted content.
- [x] Implement freshness policy library and reusable banner.
- [x] Integrate freshness UX on dashboard and book detail pages.

## High

- [x] Roll freshness UX to rewrite plan, final manuscript, and analytics.
- [x] Remove duplicate refresh bursts in interactive actions.
- [x] Ensure stale snapshots remain visible on refresh failure.

## Medium

- [x] Add refresh telemetry events and server sink for API reliability.
- [x] Add unit tests for stale/expired threshold calculations.
- [x] Add integration-style component tests for manual refresh and force-refresh behavior.
- [x] Surface refresh telemetry aggregation on analytics page (last 24h).
- [x] Add freshness telemetry filters (24h/7d and route) and mini trend visualization.
- [x] Add dedicated paginated freshness reliability API endpoint for scalable drilldown views.
- [x] Add cursor-based drilldown filters (`eventName`, `status`) to freshness analytics endpoint.
- [x] Add freshness reliability SLO cards (success/failure/forced rates with thresholds).
- [x] Add retention cleanup policy for freshness telemetry (`cleanup_freshness_events`).
- [x] Add critical failure alert hooks (`repeated_refresh_failures`, `forced_refresh_loop`).

## Documentation

- [x] Update `CHANGELOG.md` with this reliability/freshness work.
- [x] Update `docs/STATUS.md` and `README.md` with new data lifecycle behavior.
- [ ] Keep this TODO updated per PR.

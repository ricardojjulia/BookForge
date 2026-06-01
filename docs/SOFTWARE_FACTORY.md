# Software Factory Execution Log

Last updated: 2026-06-01
Owner: Engineering
Branch: feat/v0.2.2-creator-panels-resume-account

## Mission

Execute the reliability and workflow pivot work with traceable phases, explicit acceptance criteria, and fresh documentation.

## Scope

- Fix all High findings from the 2026-06-01 assessment.
- Implement stale-aware data UX with manual refresh and force-refresh policy.
- Add tooling and process guardrails for reliability.
- Refresh architecture/status/changelog/todo documentation.

## High Findings and Fix Ownership

1. Corrupted architecture document

- Status: In progress
- Owner: Docs/Platform
- Deliverable: Clean `docs/ARCHITECTURE.md` as single source of truth.

1. Always-live fetch strategy increases fragility

- Status: In progress
- Owner: App Platform
- Deliverable: Freshness tooling + route integration + reduced unconditional dynamic behavior.

## Execution Phases

### Phase A — Documentation Recovery (Blocker)

- [x] Replace corrupted architecture document.
- [x] Align `README.md`, `docs/STATUS.md`, and changelog language with actual behavior.

Acceptance:

- Architecture docs no longer contain unrelated content.
- Data freshness model documented as policy.

### Phase B — Freshness Contract + UX

- [x] Create shared freshness policy module.
- [x] Add reusable freshness banner with refresh controls.
- [x] Add force-refresh threshold handling (`>= 48h`) with non-blocking fallback.

Acceptance:

- User can see freshness age and refresh manually.
- Expired snapshots trigger forced refresh attempt without blocking stale display.

### Phase C — Key Route Rollout

- [x] Dashboard
- [x] Book page
- [x] Rewrite plan
- [x] Final manuscript
- [x] Analytics

Acceptance:

- All key pages surface freshness and recover gracefully from refresh failures.

### Phase D — Tooling and Guardrails

- [x] Add refresh telemetry instrumentation for lifecycle events (`freshness_refresh_attempt`, `freshness_refresh_success`, `freshness_refresh_failed`, `freshness_forced_refresh_triggered`).
- [x] Add test coverage for freshness math and UI thresholds.
- [x] Add engineering checklist to prevent accidental always-live fetch regressions.

Acceptance:

- CI verifies freshness behavior.
- Team has operational visibility on refresh failures.

### Phase E — Admin + Course Domain Preparation

- [x] Publish domain ADR for admin-first/course-aware workflow.
- [ ] Define migration strategy from book-centric to hybrid domain.

Acceptance:

- Approved domain map before feature implementation.

## Risk Register

- Risk: Auth-dependent routes may still be dynamic even without explicit `force-dynamic`.
- Mitigation: Introduce client freshness controls and route-level policy wrappers.

- Risk: Force-refresh can loop if based on source update timestamps only.
- Mitigation: Track snapshot refresh timestamp per route key and force once per stale window.

## Change Log (Factory)

- 2026-06-01: Created software-factory execution log and phased plan.
- 2026-06-01: Completed High-finding architecture doc fix and rolled freshness UX to dashboard/book/rewrite/final/analytics routes.
- 2026-06-01: Added ADR-0001 for admin/course-aware domain strategy and refreshed changelog/status/howto/readme docs.
- 2026-06-01: Implemented freshness telemetry sink (`/api/telemetry/freshness`) and added Vitest coverage for freshness policy and banner lifecycle behavior.
- 2026-06-01: Added durable `freshness_events` storage + analytics page 24h reliability section (event counts, route success rates, latest failures).
- 2026-06-01: Added filterable freshness telemetry panel with 24h/7d window controls, route filter, and mini trend bars.
- 2026-06-01: Added dedicated paginated freshness reliability endpoint (`GET /api/analytics/freshness`) and switched telemetry panel to API-backed drilldown pagination.
- 2026-06-01: Upgraded freshness endpoint to cursor pagination + drilldown filters (`window`, `routeKey`, `eventName`, `status`) with event row table in UI.
- 2026-06-01: Added lightweight reliability SLO cards (success/failure/forced rates) with threshold health badges.
- 2026-06-01: Added retention cleanup function (`cleanup_freshness_events`) and freshness alert table for operational signals.
- 2026-06-01: Added critical failure observability hooks in telemetry ingest (repeated failures and forced-refresh loops) with alert surfacing in analytics panel.

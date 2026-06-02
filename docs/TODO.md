# Engineering TODO

Last updated: 2026-06-01

## v0.3.0 Kickoff (Scaffold)

## Critical

- [ ] Lock v0.3.0 scope and success metrics.
- [ ] Convert scope into prioritized epics with acceptance criteria.
- [ ] Create implementation milestones and release checkpoint dates.

## High

- [ ] Define durable job architecture for long-running AI workflows.
- [ ] Define observability and alerting coverage targets for key user journeys.
- [ ] Define collaboration and account-management UX improvements for v0.3.0.

## Medium

- [ ] Map ADR-0001 entities to deliverable slices (API, UI, policy, telemetry).
- [ ] Add test plan targets by layer (unit, integration, E2E) for v0.3.0 scope.
- [ ] Add documentation/update checklist for each PR in this cycle.

## Critical

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

## Domain Shift (Admin + Courses)

- [x] Draft ADR for course domain (courses/modules/lessons/progress/admin).
- [ ] Define how book outputs map into course assets.
- [ ] Define admin controls and refresh policy SLAs by screen.

## Documentation

- [x] Update `CHANGELOG.md` with this reliability/freshness work.
- [x] Update `docs/STATUS.md` and `README.md` with new data lifecycle behavior.
- [ ] Keep this TODO updated per PR.

# Engineering TODO

Last updated: 2026-06-01

## Critical

- [x] Rebuild `docs/ARCHITECTURE.md` to remove corrupted content.
- [x] Implement freshness policy library and reusable banner.
- [x] Integrate freshness UX on dashboard and book detail pages.

## High

- [x] Roll freshness UX to rewrite plan, final manuscript, and analytics.
- [x] Remove duplicate refresh bursts in interactive actions.
- [x] Ensure stale snapshots remain visible on refresh failure.

## Medium

- [ ] Add refresh telemetry events and dashboard for API reliability.
- [ ] Add unit tests for stale/expired threshold calculations.
- [ ] Add integration tests for manual refresh and force-refresh behavior.

## Domain Shift (Admin + Courses)

- [x] Draft ADR for course domain (courses/modules/lessons/progress/admin).
- [ ] Define how book outputs map into course assets.
- [ ] Define admin controls and refresh policy SLAs by screen.

## Documentation

- [x] Update `CHANGELOG.md` with this reliability/freshness work.
- [x] Update `docs/STATUS.md` and `README.md` with new data lifecycle behavior.
- [ ] Keep this TODO updated per PR.

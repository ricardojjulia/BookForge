# ADR-0001: Admin-First and Course-Aware Domain Expansion

Date: 2026-06-01
Status: Proposed
Owner: Product + Platform

## Context

BookForge is currently book-centric and strong in manuscript lifecycle operations. Product direction now requires stronger admin workflows and future course-oriented delivery.

## Decision

Adopt a hybrid domain model:

- Keep book production as the upstream authoring pipeline.
- Add a new course domain downstream for publication and delivery.
- Introduce admin-focused operational views that can monitor and refresh both domains.

## Proposed Entities

- `courses`
- `course_modules`
- `course_lessons`
- `course_assets`
- `course_enrollments`
- `course_progress_events`

## Integration Strategy

1. Treat accepted book artifacts (chapters, summaries, matter sections, exports) as source material.
2. Provide explicit admin actions to publish selected artifacts into course assets.
3. Preserve traceability from course assets back to source book/version.

## Freshness and Reliability Policy

All admin and course screens must follow the same data freshness contract:

- Fresh: < 24h
- Stale: >= 24h and < 48h (prompt refresh)
- Expired: >= 48h (force one refresh attempt, then show stale snapshot + warning on failure)

## Consequences

Positive:

- Maintains current book-value proposition while enabling admin/course growth.
- Avoids mixing authoring concerns directly into course delivery tables.

Trade-offs:

- Requires migration and new admin tooling.
- Requires explicit publication workflows between domains.

## Follow-up Tasks

- Design schema and RLS for course domain.
- Define publication pipeline from book artifacts to course assets.
- Implement admin dashboard with freshness telemetry.

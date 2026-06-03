# Software Factory Execution Log

Last updated: 2026-06-02
Owner: Engineering
Branch: feat/v0.3.0-next

## Mission

Execute the v0.3.0 software-factory cycle with traceable phases, explicit acceptance criteria, and fresh documentation.

## Scope

- Lock the v0.3.0 release slice.
- Design durable background processing and job-history visibility.
- Improve collaborator and export workflows.
- Split the admin/course direction into implementable slices.
- Keep status, TODO, and factory documentation in sync with delivery.

## v0.3.0 Workstreams

1. Release scope and milestones

- Status: In progress
- Owner: Product + Engineering
- Deliverable: Release goals, non-goals, and exit criteria for v0.3.0.

1. Operational maturity

- Status: In progress
- Owner: App Platform
- Deliverable: Durable jobs, job-history UX, retry/cancel/visibility policy.

1. Product quality

- Status: Planned
- Owner: App UI + Platform
- Deliverable: Export metadata controls, collaborator workflow refinements, and test expansion.

1. Admin/course delivery

- Status: Planned
- Owner: Product + Platform
- Deliverable: ADR-0001 slices for course assets, admin controls, and freshness SLAs.

## Execution Phases

### Phase A — Scope Lock (Blocker)

- [ ] Confirm v0.3.0 scope and non-goals.
- [ ] Define release checkpoints and owner map.
- [ ] Freeze the first implementation slice.

Acceptance:

- Scope is small enough to ship incrementally.
- Every slice has an owner and acceptance criteria.

### Phase B — Operational Maturity

- [ ] Design durable background processing for long-running AI workflows.
- [ ] Add a job-history screen for queued/running/completed work.
- [ ] Define retry/cancel/visibility behavior.

Acceptance:

- Long-running work can be observed and managed.
- Job state is visible without relying on request-bound completion.

### Phase C — Product Quality

- [ ] Refine export styling and metadata controls.
- [ ] Improve collaborator workflows where coordination is still manual.
- [ ] Expand tests around parsing, rewrite planning math, and export assembly.

Acceptance:

- The highest-friction author workflows are easier to complete.
- Test coverage increases in the riskier core paths.

### Phase D — Admin + Course Delivery

- [ ] Map accepted book artifacts into course assets.
- [ ] Define admin controls and freshness SLAs by screen.
- [ ] Split ADR-0001 into implementable slices.

Acceptance:

- The admin/course path is ready for implementation without re-litigating the domain model.

## Risk Register

- Risk: Scope creep can turn v0.3.0 into an unfocused release.
- Mitigation: Freeze the first slice and require explicit acceptance criteria.

- Risk: Long-running jobs can still be request-bound.
- Mitigation: Favor a dedicated job-history contract and later durable worker integration.

## Change Log (Factory)

- 2026-06-02: Added collaborator workflow ownership for revision review and rewrite approval (reviewer assignment + status transitions) with in-app notifications and optional email hooks.
- 2026-06-02: Completed export-controls refinement with explicit "Use last export settings" / "Reset to recommended defaults" actions and EPUB/PDF guardrail validation, plus export route/component tests.
- 2026-06-02: Added export-control persistence so final manuscript metadata/style settings are saved on export rows and used to prefill the next export run.
- 2026-06-02: Moved remaining rewrite-related UI callers (guidance rewrite modal, revision review rewrite-again action, and persistent jobs retry/replacement for queue-capable routes) to queue-first handoff.
- 2026-06-02: Split rewrite execution (main panel flow) into a queue-first job creation step plus a worker resume call so long rewrite batches no longer block the initiating request.
- 2026-06-02: Split Critic batch generation into a queue-first job creation step plus a worker resume call so Book Actions can launch all-lens evaluation without blocking the full batch run.
- 2026-06-02: Split Manuscript Blueprint generation into a queue-first job creation step plus a worker resume call so the dashboard can launch analysis without waiting on the full chunk loop.
- 2026-06-02: Split chapter summary generation into a queue-first job creation step plus a worker resume call so the UI no longer blocks on the whole summarization batch.
- 2026-06-02: Split planned draft generation into a queue-first job creation step plus a worker handoff so the request handler no longer has to do the whole batch inline.
- 2026-06-02: Added a server worker route for auto-review so the wizard can enqueue work and monitor progress instead of orchestrating the stages itself.
- 2026-06-02: Extended the heartbeat pattern to the full-book rewrite executor so paragraph-level rewrite jobs stay visible during long model calls.
- 2026-06-02: Added persistent heartbeats for long-running analysis, summary, critic, and draft-generation routes so in-flight jobs stay visible during blocking model calls.
- 2026-06-02: Completed the Phase 1 job-history visibility slice with summary cards and stale-running prioritization.
- 2026-06-02: Reframed the factory log for the v0.3.0 cycle and updated branch context.
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

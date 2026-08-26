# CreativeWriter Council Review

Date: 2026-08-02
Phase: 3R Factory Hardening
Status: Review complete with required fixes applied

## Product Council

CreativeWriter should remain a separate offline writing desk product that is BookForge-aware. This preserves the subscription value of the cloud product while giving writers a serious offline workspace. The product story is stronger if CreativeWriter feels like the forge bench where the manuscript is shaped, while BookForge Cloud is the foundry records, review system, and publishing pipeline.

Decision: continue as a compatible sibling product, not a hidden module inside the SaaS codebase.

## Architecture Council

The current API direction is correct: desktop clients should speak to BookForge APIs, not directly to Supabase. That keeps cloud authorization, subscriptions, audit rules, and future sync migrations centralized.

Decision: keep CreativeWriter client storage independent and make BookForge APIs the only cloud bridge.

## Security Council

The biggest immediate risks were unbounded imports, invalid package JSON, and weak runtime validation. These have been corrected for the current phase. The next security concern is durable device/link authorization and idempotent sync persistence.

Decision: do not call the current sync implementation GA-ready until there is a durable sync ledger.

## Data Council

Timestamp-derived versions are acceptable for a prototype but too weak for a paid sync promise. The cloud needs a real ledger so every push has a durable idempotency key, base version, applied version, and conflict record.

Decision: Phase 4 should introduce sync ledger persistence before expanding write operations.

## Wildcard Review

The dangerous failure is not an obvious crash. It is user trust loss: a writer imports a complex project, assumes it is complete, edits it, then later discovers missing notes, changed structure, or a conflict that was only returned once and never persisted. The product must make import fidelity and sync conflict state visible.

Required response:

- Keep import labeled as best-effort until per-format fidelity is proven.
- Persist conflict records before broad beta.
- Build a local conflict review surface into CreativeWriter.
- Add import reports visible to users after upload.

## Final Council Verdict

Proceed to the next implementation phase only as a controlled factory slice. The current work is a credible API foundation, not yet a releasable CreativeWriter product.

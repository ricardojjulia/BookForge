# CreativeWriter Failure Modes

Date: 2026-08-02
Phase: 3R Factory Hardening
Status: Initial review

## Import Failures

- No files uploaded: reject with a clear import error.
- Too many files uploaded: reject before parsing file contents.
- Oversized file uploaded: reject before parsing file contents.
- Unsupported legacy `.doc`: warn and require conversion.
- Unsupported Joplin `.jex`: warn and require Markdown export.
- Archive contains too many entries: import the bounded prefix and warn.
- Archive contains no readable author text: reject if no manuscript text remains.
- Malformed `.bookforge.json`: reject through package schema validation.

## Sync Failures

- User is signed out: return `401`.
- Link body is invalid: return an error and do not call sync service.
- Push account does not match authenticated user: return `403`.
- Cloud row is unavailable under RLS or missing: return service error.
- Local base version is stale: return conflict and leave cloud text unchanged.
- Unsupported operation: reject that change and continue evaluating the request.

## Operational Failures

- Large imports may exceed serverless execution budgets.
- Text extraction libraries can fail on corrupt PDFs, DOCX files, or EPUBs.
- Timestamp cursors can be imprecise under concurrent writes.
- Client retries need idempotency persistence before GA.

## Escalation Rules

- Authentication and authorization failures are hard stops.
- Validation failures are hard stops unless the importer can safely skip the affected file and warn.
- Conflict failures are not server errors; they are expected sync outcomes.
- Extraction failures should be recorded as import warnings when possible.

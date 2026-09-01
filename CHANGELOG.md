# Changelog

## 0.3.0 — 2026-08-31

### Added

- Portable JSON flow import and export in both the API and visual editor.
- Optional bearer-token protection for flow management operations.
- Alembic migration lifecycle and an initial schema migration.
- PostgreSQL + Redis production Docker Compose profile.
- Drag-to-add positioning from the node palette.

### Changed

- Frontend CI now runs lint, tests and the production build.
- Local database and volume names now use the Revelys identity.

## 0.2.0 — 2026-08-31

### Added

- Immutable numbered flow versions with explicit draft and publish APIs.
- SQL-backed session persistence with optimistic concurrency control.
- Idempotent Twilio call creation keyed by provider call ID.
- Typed Pydantic configuration models for every node type.
- Structural validation for ambiguous routes and non-terminating subgraphs.
- Frontend validation feedback, publish controls, ESLint and Vitest.
- Ruff, strict mypy and coverage enforcement for the backend.

### Changed

- Sessions now remain pinned to the flow version with which they started.
- Dependencies are reproducible through exact Python versions and `package-lock.json`.
- Input trace events retain metadata without duplicating the raw customer value.
- CI performs backend lint, static analysis and coverage plus clean frontend checks.

### Removed

- Process-local in-memory session storage.

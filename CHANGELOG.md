# Changelog

## 0.7.0 — 2026-09-01

### Added

- Architect IVR catalog with persistent selection, alphabetical listing and localized timestamps.
- New-IVR workflow that creates a valid starter graph with start and end nodes.
- Localized contextual descriptions for every node type in the palette and canvas.
- Pure frontend tests for IVR identifiers and starter-flow generation.

### Changed

- Architect opens on the IVR catalog instead of silently selecting the first available flow.
- Saving, importing and creating flows now keep the catalog state synchronized.
- Removed the GitHub shortcut from the application header.

## 0.6.0 — 2026-09-01

### Added

- Brazilian Portuguese localization as the default interface, with persistent `PT-BR` and `EN-US` language selection.
- Separate Architect and Collaborate application spaces with contextual navigation.
- Collaborate agent queue with refresh, localized timestamps and session claiming.
- Frontend translation and localized validation-message tests.

### Changed

- Flow design, simulation and architecture now live under Architect.
- Operational metrics and human-agent work now live under Collaborate.
- Browser speech recognition and synthesis follow the selected interface language.
- Frontend Docker builds use `npm ci` and exclude local dependencies from the build context.

## 0.5.0 — 2026-09-01

### Added

- Nemesys product identity and repository/package naming.
- Enforced viewer, editor, admin and owner workspace roles with member-management APIs and last-owner protection.
- Persisted audit events for flow, session, queue, authentication and retention operations.
- Login lockout controls, readiness/liveness probes, request IDs and HTTP security headers.
- Timestamped generic webhook signatures with a configurable anti-replay window.
- Automated Python/npm vulnerability audits and weekly Dependabot updates.

### Changed

- Flow identifiers, published versions and provider call IDs are now isolated by workspace at the database constraint level.
- The default SQLite database, Docker volume and PostgreSQL profile use the Nemesys name.

## 0.4.0 — 2026-09-01

### Added

- PBKDF2 password authentication, revocable sessions and workspace isolation.
- Automatic adoption and migration of legacy SQLite databases.
- Configurable terminal-session retention and operational metrics.
- Human-agent queue node, queue API and browser agent simulator.
- Browser speech input/output and a backend telephony speech contract.
- Signed, idempotent generic JSON telephony webhooks.

### Changed

- Flow, session, queue and metrics access is scoped to the active workspace.
- The demo human-agent route now pauses in a real queue state.

## 0.3.0 — 2026-08-31

### Added

- Portable JSON flow import and export in both the API and visual editor.
- Optional bearer-token protection for flow management operations.
- Alembic migration lifecycle and an initial schema migration.
- PostgreSQL + Redis production Docker Compose profile.
- Drag-to-add positioning from the node palette.

### Changed

- Frontend CI now runs lint, tests and the production build.
- Local database and volume names now use the project identity.

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

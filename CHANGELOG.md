# Changelog

## 0.12.0 — 2026-09-01

### Added

- IVR search by name, description or ID, with recent/name sorting and a dedicated no-results state.
- Visible editor shortcuts for saving a draft and saving before browser testing.
- Customer-focused simulator mode with technical execution details available on demand.

### Changed

- The editor palette now presents the four essential journey nodes first and progressively reveals AI, decision, data and outcome nodes.
- Catalog controls adapt to narrow screens while preserving active and archived lifecycle filters.

## 0.11.0 — 2026-09-01

### Added

- Dismissible four-step quick-start guide and a permanent task-oriented Help dialog.
- Skip-to-content navigation and consistent visible keyboard focus across interactive controls.
- Grouped editor palette, contextual configuration guidance, unsaved-change indicator and explicit import/export controls.
- Save-and-test editor action that validates and persists a draft before opening the simulator.
- Unsaved-draft protection for browser exits and in-app navigation away from the editor.
- Agent next-action guidance with one-click queue entry and exit.
- Plain-language role descriptions in workspace user creation.

### Changed

- User creation is progressively disclosed so the member list remains the primary administration view.
- The visual editor is lazy-loaded, reducing the initial production bundle from about 513 kB to 312 kB.
- Presence controls are disabled during an active interaction to prevent accidental routing-state changes.

## 0.10.0 — 2026-09-01

### Added

- Dedicated Administration application for creating workspace users, assigning roles and activating, deactivating or removing memberships.
- Customer-centered Collaborate agent desktop with interaction inbox, customer context, recent journey events and after-call work.
- Workspace-user creation and membership-status APIs with audit events and Alembic-managed active membership state.
- End-to-end API coverage for the user lifecycle and authenticated agent identity.

### Changed

- Authenticated presence, assignment and claim operations are now bound to the signed-in user's email to prevent agent impersonation.
- Inactive memberships immediately lose workspace access, revoke existing sessions and cannot sign in to an account without another active workspace.
- Manual agent identity remains available for the authentication-free offline demo.

## 0.9.0 — 2026-09-01

### Added

- Provider-neutral flow-outcome nodes with success/failure results, execution traces and operational metrics.
- Persistent agent presence and routing status in the Collaborate workspace.
- Agent-assigned interaction lists and after-call work with wrap-up codes and optional notes.
- Workspace-scoped agent-operation APIs and an Alembic migration for indexed assignment state.

### Changed

- Agents must be on queue before claiming an interaction and move to interacting while handling it.
- Agent-assisted sessions now enter a traceable wrap-up state before becoming completed.
- Collaborate separates waiting interactions from the active agent's assigned work.

## 0.8.0 — 2026-09-01

### Added

- Complete IVR lifecycle controls for duplication, archival, restoration and protected permanent deletion.
- Architect version-history workspace with published-snapshot selection, structural draft comparison and rollback to draft.
- Audited lifecycle and version-restore API operations plus an Alembic migration for archive metadata.
- Frontend structural-diff tests and backend lifecycle, deletion-safety and rollback coverage.

### Changed

- Archived IVRs are separated from active catalog entries and cannot be saved, published or used to start new sessions.
- Permanent deletion requires an admin or owner, prior archival and no linked session history.
- Existing published versions and active sessions remain immutable when a draft is restored from history.

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

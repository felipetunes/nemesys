# Architecture

## Design goals

1. Keep the flow runtime independent from any telephony vendor.
2. Make flow execution deterministic and observable.
3. Treat AI as a bounded decision component, not the owner of call state.
4. Allow the repository to run without paid external services.
5. Keep draft editing separate from immutable versions used by active sessions.

## Runtime model

A flow is a directed graph of nodes and edges. Editors change a mutable draft and publish immutable numbered versions. A `CallSession` is pinned to one published version and owns the current node, variables, outcomes, trace and waiting state. The engine advances until execution pauses for input or a queue, reaches agent after-call work, completes, fails or reaches its safety limit.

Named success/failure outcomes are explicit graph nodes. They remain provider-neutral, are included in the execution trace and can be aggregated without asking an AI model to infer whether the journey succeeded.

The runtime never allows an AI model to pick an arbitrary node ID. The `ai_intent` service returns one of the node's configured intent labels. Graph routing still remains deterministic.

## Layers

### API
Validates request/response objects and exposes flow/session resources.

### Flow repository
Stores mutable drafts and immutable published JSON versions in SQL. Editing or publishing a new draft never changes the graph used by an active session.

### Session repository
Persists sessions and traces in SQL. Each update checks an optimistic revision so concurrent inputs cannot silently overwrite one another.

### Flow engine
Pure orchestration logic. Each node type emits trace events and mutates the session only through well-defined transitions.

### Intent classifier
Provider abstraction with two implementations:

- OpenAI classifier when `OPENAI_API_KEY` exists;
- local keyword classifier for offline/demo mode.

### Telephony adapter
Converts provider webhook calls into the same session operations used by the browser simulator. Provider call IDs are unique, making webhook retries idempotent. This prevents telephone-specific code from leaking into the core engine.

### Identity and workspaces

Passwords use salted PBKDF2 derivation. Only token hashes are persisted, tokens expire, logout revokes them, and repeated failures temporarily lock the account. API access resolves one workspace membership and enforces viewer, editor, admin or owner permissions. Workspace IDs participate in flow/version primary keys and provider-call uniqueness constraints, so tenants may safely reuse their own identifiers. With authentication disabled, the same code uses the `default` offline workspace.

### Operations

Terminal sessions have configurable retention. Metrics are computed from persisted sessions and their trace timestamps, including volume, state, intent, channel, outcomes, wrap-up codes, completion rate and duration. A queue node pauses the engine in a traceable `queued` state until an on-queue agent claims it. Persistent presence and routing status distinguish availability from active interaction work. An agent-assisted session reaches `wrap_up` before completion, where a bounded wrap-up code and optional notes finish after-call work. Sensitive management operations append workspace-scoped audit events; request IDs and structured completion logs make API failures correlatable without logging request bodies.

## Production evolution

The included production profile applies Alembic migrations, uses PostgreSQL as the durable source of truth and provisions Redis for the next distributed-worker milestone. Further production work includes pushing traces onto an event bus, object storage for recordings, OpenTelemetry export and alerting, key rotation and external identity-provider integration.

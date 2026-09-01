# Architecture

## Design goals

1. Keep the flow runtime independent from any telephony vendor.
2. Make flow execution deterministic and observable.
3. Treat AI as a bounded decision component, not the owner of call state.
4. Allow the repository to run without paid external services.
5. Keep draft editing separate from immutable versions used by active sessions.

## Runtime model

A flow is a directed graph of nodes and edges. Editors change a mutable draft and publish immutable numbered versions. A `CallSession` is pinned to one published version and owns the current node, variables, trace and waiting state. The engine advances until one of three things happens:

- the flow ends;
- a node requires user input;
- a safety limit is reached.

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

Passwords use salted PBKDF2 derivation. Only token hashes are persisted, tokens expire, and logout revokes them. API access resolves one workspace membership and applies that workspace to flow, version, session, queue and metric queries. With authentication disabled, the same code uses the `default` offline workspace.

### Operations

Terminal sessions have configurable retention. Metrics are computed from persisted sessions and their trace timestamps, including volume, state, intent, channel, completion rate and duration. A queue node pauses the engine in a traceable `queued` state until an explicit agent claim resumes deterministic routing.

## Production evolution

The included production profile applies Alembic migrations, uses PostgreSQL as the durable source of truth and provisions Redis for the next distributed-worker milestone. Further production work includes pushing traces onto an event bus, object storage for recordings, OpenTelemetry, key rotation and external identity-provider integration.

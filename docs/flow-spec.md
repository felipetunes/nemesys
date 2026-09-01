# Flow JSON specification

A flow contains:

```json
{
  "id": "demo-commerce",
  "name": "Demo Commerce",
  "nodes": [],
  "edges": []
}
```

## Node types

### `start`
Entry point. Exactly one is recommended.

### `prompt`
Adds a text prompt to the trace.

Config:

```json
{"message": "Welcome"}
```

### `collect_input`
Pauses execution and waits for browser/telephony input.

```json
{
  "prompt": "How can I help?",
  "variable": "customer_reason",
  "input_mode": "speech_or_dtmf"
}
```

### `ai_intent`
Classifies a session variable against a closed list of categories.

```json
{
  "source_variable": "customer_reason",
  "result_variable": "intent",
  "intents": ["order_status", "cancellation", "human_agent", "fallback"]
}
```

Outgoing edges should use `condition` equal to an intent label.

### `decision`
Routes using an existing variable.

```json
{"variable": "intent"}
```

### `set_variable`
Stores a static value.

```json
{"variable": "tier", "value": "gold"}
```

### `queue`

Pauses execution in a named human-agent queue. Claiming the session through the queue API records the assigned agent and wait time, then resumes on the node's unconditional edge.

```json
{
  "queue_name": "customer-care",
  "message": "You are waiting for a human agent."
}
```

### `end`
Terminates the session.

```json
{"message": "Thanks for calling."}
```

## Edge selection

If a node has conditional edges, the engine compares the node result/value to `edge.condition`. If no condition matches, an edge with condition `fallback` or an unconditional edge is used.

## Structural validation

- A flow has exactly one `start` and at least one `end`.
- Non-routing nodes have exactly one unconditional outgoing edge.
- Routing conditions and default routes are unambiguous.
- Every node reachable from Start has a path to an End.
- Node configuration fields are validated by a type-specific Pydantic model.

## Draft and publish lifecycle

`PUT /api/flows/{flow_id}` saves a mutable draft. `POST /api/flows/{flow_id}/publish` validates that draft and creates a new immutable version. New sessions use the latest published version unless a specific version is requested; existing sessions remain pinned to the version with which they started.

Sessions transition through `running`, `waiting_input`, `queued`, `completed` or `failed`. Each transition that changes execution behavior is represented in the trace.

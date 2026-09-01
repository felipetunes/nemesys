# AGENTS.md — Nemesys

This repository is designed to be continued with coding agents such as Codex.

## Product goal

Build an open-source, provider-neutral IVR flow designer and runtime. A flow must be testable in the browser without paid services and optionally executable through real telephony adapters.

## Architectural rules

1. **Keep `FlowEngine` provider-neutral.** No Twilio/OpenAI/FastAPI imports inside the engine package.
2. **AI never chooses arbitrary node IDs.** AI may return bounded structured values (for example an intent enum); graph edges decide routing.
3. **Offline mode must remain functional.** No OpenAI key should be required for the demo flow.
4. **Telephony is an adapter.** Provider-specific webhook code belongs under `app/telephony/`.
5. **Every execution decision should be traceable.** Add a `TraceEvent` when introducing important runtime behavior.
6. **Do not place secrets in code or examples.** Use environment variables.
7. **Do not commit real customer data, phone numbers, credentials, recordings or proprietary flow exports.**

## Before changing runtime behavior

Run:

```bash
cd backend
python -m ruff check app tests
python -m mypy app
python -m pytest -q --cov=app --cov-fail-under=80
python -m compileall -q app tests
```

For frontend changes:

```bash
cd frontend
npm ci
npm run check
```

## Code style

- Python: typed functions, small services, Pydantic models at boundaries.
- TypeScript: strict mode; avoid `any` unless an external library forces it.
- Runtime behavior should have tests.
- Prefer explicit state transitions to prompt-driven orchestration.

## Useful next milestones

- Redis-backed distributed queue workers;
- production speech providers and additional carrier adapters;
- OpenTelemetry export and alerting;
- backup/restore automation and key rotation;
- public demo deployment and end-to-end browser tests.

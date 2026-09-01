# Revelys

**Current project version: `0.2.0` — stabilization release**

**A visual, AI-assisted IVR flow builder and runtime for learning, prototyping and portfolio demos.**

Revelys is a full-stack project that lets you design a call flow visually, run it in a browser simulator, inspect every execution event and optionally connect a real phone number through a Twilio-compatible webhook adapter.

> The repository is intentionally provider-neutral at its core. The included Twilio adapter is only one example of how a telephony provider can drive the same flow engine.

## Why this project exists

Traditional IVRs are often built inside proprietary platforms. Revelys exposes the core ideas as code:

- graph-based flow design;
- deterministic runtime state machine;
- prompt and input handling;
- DTMF and free-text/speech intent input;
- AI intent classification with structured JSON output;
- fallback classification when no OpenAI key exists;
- session variables and execution traces;
- REST APIs and WebSocket-ready event delivery;
- optional real telephony webhook integration;
- Dockerized local environment;
- immutable published flow versions and durable SQL-backed sessions;
- automated backend and frontend quality checks.

## Demo flow

The seeded demo simulates an e-commerce service line:

```text
Start
  -> Welcome prompt
  -> Collect customer reason
  -> AI intent classification
      -> order_status -> Order status prompt -> End
      -> cancellation -> Cancellation prompt -> End
      -> human_agent -> Transfer-like message -> End
      -> fallback -> Clarification prompt -> End
```

## Architecture

```text
                         +----------------------+
                         |   React Flow Editor  |
                         +----------+-----------+
                                    |
                                    | REST
                                    v
+-------------+           +---------+----------+          +-----------------+
| Web Browser |<--------->|    FastAPI API     |<-------->|   SQLite / DB   |
|  Simulator  |           +---------+----------+          +-----------------+
+-------------+                     |
                                    v
                         +----------+-----------+
                         |     Flow Engine      |
                         | state machine + trace|
                         +----+-------------+---+
                              |             |
                              v             v
                        +-----------+   +-----------+
                        | OpenAI AI |   | Telephony |
                        |  Intent   |   |  Adapter  |
                        +-----------+   +-----------+
```

## Tech stack

### Frontend
- React + TypeScript
- Vite
- `@xyflow/react` for the visual graph editor
- Lucide icons

### Backend
- Python 3.11+
- FastAPI
- SQLAlchemy
- OpenAI Responses API integration
- SQLite by default (easy to replace with PostgreSQL)
- Pytest

### Infrastructure
- Docker / Docker Compose
- GitHub Actions

## Quick start

### 1. Clone and configure

```bash
git clone https://github.com/felipetunes/revelys.git
cd revelys
cp .env.example .env
```

An OpenAI key is **optional**. Without it, the project uses a deterministic local classifier so the demo still works.

### 2. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API docs: `http://localhost:8000/docs`

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

### Docker

```bash
cp .env.example .env
docker compose up --build
```

## Using OpenAI

Set:

```env
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-5.6-luna
```

The backend requests a strict JSON intent object and validates the returned category against the intents configured in the `ai_intent` node. If the provider errors, the runtime records the error in the trace and falls back safely.

## Connecting a real phone number (optional)

The repository contains a Twilio-style webhook adapter under:

```text
POST /api/telephony/twilio/voice
POST /api/telephony/twilio/input
```

A public HTTPS URL is required for a real provider to call your local backend. Set `PUBLIC_BASE_URL` to that URL and configure the provider's incoming voice webhook to `/api/telephony/twilio/voice`.

For production, enable signature validation:

```env
TWILIO_AUTH_TOKEN=...
TWILIO_VALIDATE_SIGNATURES=true
```

The demo flow accepts both DTMF and speech/free text.

## API highlights

```text
GET    /health
GET    /api/flows
GET    /api/flows/{flow_id}
PUT    /api/flows/{flow_id}
POST   /api/flows/actions/validate
GET    /api/flows/{flow_id}/versions
GET    /api/flows/{flow_id}/versions/{version}
POST   /api/flows/{flow_id}/publish
POST   /api/sessions
GET    /api/sessions/{session_id}
POST   /api/sessions/{session_id}/input
POST   /api/telephony/twilio/voice
POST   /api/telephony/twilio/input
```

## Repository structure

```text
revelys/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── engine/
│   │   ├── services/
│   │   └── telephony/
│   └── tests/
├── frontend/
│   └── src/
├── docs/
├── .github/workflows/
├── docker-compose.yml
└── README.md
```

## Engineering decisions

See [`docs/architecture.md`](docs/architecture.md), [`docs/flow-spec.md`](docs/flow-spec.md), [`docs/telephony.md`](docs/telephony.md) and [`docs/using-with-codex.md`](docs/using-with-codex.md).

## Roadmap

- [x] Visual node editor
- [x] Persisted flow definitions
- [x] Stateful simulator
- [x] Execution trace
- [x] AI intent node
- [x] Offline deterministic fallback
- [x] Twilio-style voice adapter
- [x] Docker Compose
- [x] CI workflow
- [ ] PostgreSQL production profile
- [ ] Authentication / workspaces
- [x] Versioned flow publishing
- [ ] Audio TTS/STT provider abstraction
- [ ] Queue/agent simulator
- [ ] Metrics dashboard
- [ ] Drag-to-add node palette
- [x] Backend flow validation
- [x] Flow validation UI
- [ ] Export/import flow JSON

## Security notes

This is a learning/prototyping project. Do not process real sensitive customer data without adding production-grade authentication, encryption, secrets management, auditing, data retention policies and provider-specific webhook verification.

## License

MIT

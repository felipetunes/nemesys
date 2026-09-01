# Continuing Revelys with Codex in VS Code

The repository includes `AGENTS.md`. Keep it in the root so a coding agent can understand the architectural constraints before editing the project.

## Recommended first setup

Open the repository folder in VS Code, then use the integrated terminal:

```powershell
copy .env.example .env
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
cd ..\frontend
npm install
```

Use **Terminal → Run Task** and choose `IVR: backend` or `IVR: frontend`.

## Good Codex tasks

Examples of tasks that preserve the architecture:

```text
Read AGENTS.md first. Add versioned flow publishing so draft edits do not change the published runtime. Add backend tests and update the docs.
```

```text
Read AGENTS.md. Add an API Request node with an explicit host allowlist, timeout, JSON extraction rules and trace events. Do not allow arbitrary code execution.
```

```text
Read AGENTS.md. Add a queue/agent simulator with agents, skills, utilization and routing outcomes. Keep it separate from provider-specific telephony code.
```

```text
Read AGENTS.md. Improve the Flow Editor so conditional edges can be edited visually and show validation errors before save.
```

```text
Read AGENTS.md. Add PostgreSQL and Redis as an optional production profile while keeping SQLite/offline demo mode working.
```

## Rule of thumb

Ask Codex to implement **one vertical feature at a time**, including tests and documentation. The flow runtime is the core asset of this repository; avoid replacing deterministic routing with a single unrestricted LLM prompt.

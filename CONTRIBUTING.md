# Contributing

Thanks for improving Revelys.

## Setup

1. Copy `.env.example` to `.env`.
2. Install backend dependencies from `backend/requirements-dev.txt`.
3. Install frontend dependencies with `npm ci` in `frontend/`.
4. Run the backend and frontend checks before opening a pull request:

```bash
cd backend
ruff check app tests
mypy app
pytest -q --cov=app --cov-fail-under=80

cd ../frontend
npm run check
```

## Pull request checklist

- Add tests for runtime changes.
- Keep the browser demo working without an OpenAI key.
- Update `docs/flow-spec.md` when node behavior changes.
- Never include real customer data or secrets.
- Keep provider-specific logic outside the core flow engine.

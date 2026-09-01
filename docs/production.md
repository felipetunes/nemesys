# Production profile

The production Compose profile uses PostgreSQL for durable state and starts Redis for the next queue/cache milestone. Redis is intentionally not on the runtime request path yet; SQL remains the source of truth.

## Configure

```bash
cp env.production.example .env.production
```

Replace every placeholder in `.env.production`. Use public HTTPS URLs for `PUBLIC_API_URL`, `CORS_ORIGINS` and `PUBLIC_BASE_URL`.

Production enables `AUTH_REQUIRED` by default. The first call to `POST /api/auth/register` creates the initial owner and workspace even when later public registration is disabled. Keep `ADMIN_API_KEY` as a separate bootstrap credential and rotate both secrets before launch.

## Start

```bash
docker compose --env-file .env.production -f docker-compose.production.yml up --build -d
```

The backend runs `alembic upgrade head` before starting. The application also recognizes pre-Alembic SQLite databases and adopts their existing schema before applying newer revisions. To inspect migration state:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml exec backend alembic current
```

Back up the `postgres_data` volume before upgrades. The `redis_data` volume only holds disposable queue/cache state and must not be treated as the durable source of truth.

Terminal sessions are removed on startup after `SESSION_RETENTION_DAYS`; a protected manual run is available at `POST /api/operations/retention/run`.

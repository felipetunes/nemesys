.PHONY: dev backend frontend test lint docker-up docker-down

dev:
	@echo "Run 'make backend' and 'make frontend' in separate terminals"

backend:
	cd backend && python -m uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

test:
	cd backend && python -m pytest -q --cov=app --cov-fail-under=80

lint:
	cd backend && python -m ruff check app tests
	cd backend && python -m mypy app
	cd backend && python -m compileall -q app tests
	cd frontend && npm run check

docker-up:
	docker compose up --build

docker-down:
	docker compose down

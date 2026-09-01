import logging
import re
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.middleware.base import RequestResponseEndpoint

from app import __version__
from app.api.auth import router as auth_router
from app.api.flows import router as flows_router
from app.api.operations import router as operations_router
from app.api.queue import router as queue_router
from app.api.sessions import router as sessions_router
from app.api.workspaces import router as workspaces_router
from app.core.config import get_settings
from app.core.db import Base, SessionLocal, engine, get_db
from app.core.migrations import upgrade_database
from app.demo_flow import build_demo_flow
from app.services.auth import AuthService
from app.services.flow_repository import FlowRepository
from app.services.retention import RetentionService
from app.telephony.generic_adapter import router as generic_telephony_router
from app.telephony.twilio_adapter import router as twilio_router

settings = get_settings()
logger = logging.getLogger("nemesys.http")
REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,80}$")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    upgrade_database(engine, settings.database_url)
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        AuthService(db).ensure_default_workspace()
        repo = FlowRepository(db, "default")
        if repo.get("demo-commerce") is None:
            repo.save(build_demo_flow())
        if repo.get_published("demo-commerce") is None:
            repo.publish("demo-commerce")
        RetentionService(db).prune_terminal_sessions(settings.session_retention_days)
    yield


app = FastAPI(title=settings.app_name, version=__version__, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(flows_router)
app.include_router(auth_router)
app.include_router(workspaces_router)
app.include_router(sessions_router)
app.include_router(operations_router)
app.include_router(queue_router)
app.include_router(twilio_router)
app.include_router(generic_telephony_router)


@app.middleware("http")
async def add_operational_headers(request: Request, call_next: RequestResponseEndpoint) -> Response:
    supplied_request_id = request.headers.get("X-Request-ID", "")
    request_id = supplied_request_id if REQUEST_ID_PATTERN.fullmatch(supplied_request_id) else str(uuid4())
    started_at = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), geolocation=()"
    logger.info(
        "request_complete method=%s path=%s status=%s duration_ms=%s request_id=%s",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
        request_id,
    )
    return response


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "version": __version__,
        "ai_mode": "openai" if settings.openai_api_key else "local-fallback",
        "model": settings.openai_model if settings.openai_api_key else None,
        "management_api_protected": bool(settings.admin_api_key or settings.auth_required),
    }


@app.get("/health/live")
def liveness() -> dict[str, str]:
    return {"status": "ok", "version": __version__}


@app.get("/health/ready")
def readiness(db: Session = Depends(get_db)) -> dict[str, str]:
    try:
        db.execute(select(1))
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="Database is unavailable") from exc
    return {"status": "ready", "version": __version__}

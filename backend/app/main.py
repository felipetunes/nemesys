from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.flows import router as flows_router
from app.api.sessions import router as sessions_router
from app.core.config import get_settings
from app.core.db import Base, SessionLocal, engine
from app.demo_flow import build_demo_flow
from app.services.flow_repository import FlowRepository
from app.telephony.twilio_adapter import router as twilio_router

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        repo = FlowRepository(db)
        if repo.get("demo-commerce") is None:
            repo.save(build_demo_flow())
        if repo.get_published("demo-commerce") is None:
            repo.publish("demo-commerce")
    yield


app = FastAPI(title=settings.app_name, version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(flows_router)
app.include_router(sessions_router)
app.include_router(twilio_router)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "ai_mode": "openai" if settings.openai_api_key else "local-fallback",
        "model": settings.openai_model if settings.openai_api_key else None,
    }

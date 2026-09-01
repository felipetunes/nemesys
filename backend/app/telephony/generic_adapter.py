import hashlib
import hmac
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import Field
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.engine.runtime import FlowEngine, FlowEngineError
from app.models import CallSession, FlowIdentifier, StrictModel
from app.services.flow_repository import FlowRepository
from app.services.session_repository import SessionConflictError, SessionRepository

router = APIRouter(prefix="/api/telephony/generic", tags=["telephony"])
settings = get_settings()
engine = FlowEngine()


class GenericCallStart(StrictModel):
    provider_call_id: str = Field(min_length=1, max_length=200)
    flow_id: FlowIdentifier = "demo-commerce"
    initial_variables: dict[str, Any] = Field(default_factory=dict)


class GenericCallInput(StrictModel):
    provider_call_id: str = Field(min_length=1, max_length=200)
    value: str = Field(min_length=1, max_length=2000)


async def validate_signature(request: Request) -> None:
    if not settings.generic_webhook_secret:
        return
    signature = request.headers.get("X-Revelys-Signature", "")
    expected = hmac.new(settings.generic_webhook_secret.encode(), await request.body(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=403, detail="Invalid generic webhook signature")


@router.post("/start", response_model=CallSession)
async def start_call(
    request: Request,
    payload: GenericCallStart,
    db: Session = Depends(get_db),
) -> CallSession:
    await validate_signature(request)
    session_repo = SessionRepository(db, settings.telephony_workspace_id)
    existing = session_repo.get_by_provider_call("generic", payload.provider_call_id)
    if existing is not None:
        return existing
    flow = FlowRepository(db, settings.telephony_workspace_id).get_published(payload.flow_id)
    if flow is None:
        raise HTTPException(status_code=404, detail="Published flow not found")
    variables = {
        **payload.initial_variables,
        "channel": "generic-webhook",
        "provider_call_id": payload.provider_call_id,
    }
    session = engine.create_session(flow, variables)
    return session_repo.create(
        session,
        provider="generic",
        provider_call_id=payload.provider_call_id,
    )


@router.post("/{session_id}/input", response_model=CallSession)
async def submit_call_input(
    session_id: str,
    request: Request,
    payload: GenericCallInput,
    db: Session = Depends(get_db),
) -> CallSession:
    await validate_signature(request)
    session_repo = SessionRepository(db, settings.telephony_workspace_id)
    session = session_repo.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.variables.get("provider_call_id") != payload.provider_call_id:
        raise HTTPException(status_code=409, detail="Provider call does not match session")
    flow = FlowRepository(db, settings.telephony_workspace_id).get_version(session.flow_id, session.flow_version)
    if flow is None:
        raise HTTPException(status_code=409, detail="Session flow version no longer exists")
    expected_revision = session.revision
    try:
        engine.submit_input(flow, session, payload.value)
        return session_repo.save(session, expected_revision=expected_revision)
    except FlowEngineError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except SessionConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

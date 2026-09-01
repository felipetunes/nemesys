from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.engine.runtime import FlowEngine, FlowEngineError
from app.models import CallSession, SessionCreate, SessionInput
from app.services.flow_repository import FlowRepository
from app.services.session_repository import SessionConflictError, SessionRepository

router = APIRouter(prefix="/api/sessions", tags=["sessions"])
engine = FlowEngine()


@router.post("", response_model=CallSession)
def create_session(payload: SessionCreate, db: Session = Depends(get_db)) -> CallSession:
    flow_repo = FlowRepository(db)
    flow = (
        flow_repo.get_version(payload.flow_id, payload.flow_version)
        if payload.flow_version is not None
        else flow_repo.get_published(payload.flow_id)
    )
    if not flow:
        raise HTTPException(status_code=404, detail="Published flow version not found")
    try:
        session = engine.create_session(flow, payload.initial_variables)
    except FlowEngineError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return SessionRepository(db).create(session)


@router.get("/{session_id}", response_model=CallSession)
def get_session(session_id: str, db: Session = Depends(get_db)) -> CallSession:
    session = SessionRepository(db).get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.post("/{session_id}/input", response_model=CallSession)
def submit_input(session_id: str, payload: SessionInput, db: Session = Depends(get_db)) -> CallSession:
    session_repo = SessionRepository(db)
    session = session_repo.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    flow = FlowRepository(db).get_version(session.flow_id, session.flow_version)
    if not flow:
        raise HTTPException(status_code=409, detail="Session flow version no longer exists")
    expected_revision = session.revision
    try:
        engine.submit_input(flow, session, payload.value)
        return session_repo.save(session, expected_revision=expected_revision)
    except FlowEngineError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except SessionConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

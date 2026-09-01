from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import WorkspaceAccess, require_management_access
from app.core.db import get_db
from app.engine.runtime import FlowEngine, FlowEngineError
from app.models import CallSession, QueueClaim
from app.services.flow_repository import FlowRepository
from app.services.session_repository import SessionConflictError, SessionRepository

router = APIRouter(prefix="/api/queue", tags=["queue"])
engine = FlowEngine()


@router.get("", response_model=list[CallSession])
def list_queued_sessions(
    access: WorkspaceAccess = Depends(require_management_access),
    db: Session = Depends(get_db),
) -> list[CallSession]:
    return SessionRepository(db, access.workspace_id).list_by_status("queued")


@router.post("/{session_id}/claim", response_model=CallSession)
def claim_queued_session(
    session_id: str,
    payload: QueueClaim,
    access: WorkspaceAccess = Depends(require_management_access),
    db: Session = Depends(get_db),
) -> CallSession:
    session_repo = SessionRepository(db, access.workspace_id)
    session = session_repo.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    flow = FlowRepository(db, access.workspace_id).get_version(session.flow_id, session.flow_version)
    if flow is None:
        raise HTTPException(status_code=409, detail="Session flow version no longer exists")
    expected_revision = session.revision
    try:
        engine.connect_agent(flow, session, payload.agent_name)
        return session_repo.save(session, expected_revision=expected_revision)
    except FlowEngineError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except SessionConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

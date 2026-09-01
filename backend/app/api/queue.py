from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.auth import WorkspaceAccess, require_editor_access, require_viewer_access, resolve_agent_identity
from app.core.db import get_db
from app.engine.runtime import FlowEngine, FlowEngineError
from app.models import CallSession, QueueClaim, QueueWrapUp
from app.services.agent_repository import AgentRepository
from app.services.audit import AuditService
from app.services.flow_repository import FlowRepository
from app.services.session_repository import SessionConflictError, SessionRepository

router = APIRouter(prefix="/api/queue", tags=["queue"])
engine = FlowEngine()


@router.get("", response_model=list[CallSession])
def list_queued_sessions(
    access: WorkspaceAccess = Depends(require_viewer_access),
    db: Session = Depends(get_db),
) -> list[CallSession]:
    return SessionRepository(db, access.workspace_id).list_by_status("queued")


@router.get("/assigned", response_model=list[CallSession])
def list_assigned_sessions(
    agent_name: str = Query(min_length=1, max_length=120),
    access: WorkspaceAccess = Depends(require_viewer_access),
    db: Session = Depends(get_db),
) -> list[CallSession]:
    return SessionRepository(db, access.workspace_id).list_assigned(resolve_agent_identity(access, agent_name))


@router.post("/{session_id}/claim", response_model=CallSession)
def claim_queued_session(
    session_id: str,
    payload: QueueClaim,
    access: WorkspaceAccess = Depends(require_editor_access),
    db: Session = Depends(get_db),
) -> CallSession:
    session_repo = SessionRepository(db, access.workspace_id)
    agent_repo = AgentRepository(db, access.workspace_id)
    agent_name = resolve_agent_identity(access, payload.agent_name)
    agent = agent_repo.get(agent_name)
    if agent is None or agent.presence != "on_queue":
        raise HTTPException(status_code=409, detail="Agent must be on queue before claiming a session")
    if agent.routing_status != "idle":
        raise HTTPException(status_code=409, detail="Agent must be idle before claiming a session")
    session = session_repo.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    flow = FlowRepository(db, access.workspace_id).get_version(session.flow_id, session.flow_version)
    if flow is None:
        raise HTTPException(status_code=409, detail="Session flow version no longer exists")
    expected_revision = session.revision
    try:
        engine.connect_agent(flow, session, agent_name)
        saved = session_repo.save(session, expected_revision=expected_revision)
        agent_repo.set_routing_status(agent_name, "interacting")
        AuditService(db, access.workspace_id).record(
            actor=access.email or access.user_id or "admin",
            action="queue.session_claimed",
            resource_type="session",
            resource_id=session_id,
            details={"agent_name": agent_name},
        )
        return saved
    except FlowEngineError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except SessionConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/{session_id}/wrap-up", response_model=CallSession)
def complete_after_call_work(
    session_id: str,
    payload: QueueWrapUp,
    access: WorkspaceAccess = Depends(require_editor_access),
    db: Session = Depends(get_db),
) -> CallSession:
    session_repo = SessionRepository(db, access.workspace_id)
    session = session_repo.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    expected_revision = session.revision
    try:
        engine.complete_wrap_up(session, payload.code, payload.notes)
        saved = session_repo.save(session, expected_revision=expected_revision)
        if saved.assigned_agent:
            AgentRepository(db, access.workspace_id).finish_interaction(saved.assigned_agent)
        AuditService(db, access.workspace_id).record(
            actor=access.email or access.user_id or saved.assigned_agent or "admin",
            action="queue.wrap_up_completed",
            resource_type="session",
            resource_id=session_id,
            details={"code": payload.code},
        )
        return saved
    except FlowEngineError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except SessionConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import WorkspaceAccess, require_editor_access, require_viewer_access
from app.core.db import get_db
from app.engine.runtime import FlowEngine, FlowEngineError
from app.models import CallSession, SessionCreate, SessionInput
from app.services.audit import AuditService
from app.services.flow_repository import FlowRepository
from app.services.session_repository import SessionConflictError, SessionRepository

router = APIRouter(prefix="/api/sessions", tags=["sessions"])
engine = FlowEngine()


@router.post("", response_model=CallSession)
def create_session(
    payload: SessionCreate,
    access: WorkspaceAccess = Depends(require_editor_access),
    db: Session = Depends(get_db),
) -> CallSession:
    flow_repo = FlowRepository(db, access.workspace_id)
    draft = flow_repo.get(payload.flow_id)
    if draft is not None and draft.archived_at is not None:
        raise HTTPException(status_code=409, detail="Archived flow cannot start new sessions")
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
    created = SessionRepository(db, access.workspace_id).create(session)
    AuditService(db, access.workspace_id).record(
        actor=access.email or access.user_id or "admin",
        action="session.created",
        resource_type="session",
        resource_id=created.id,
        details={"flow_id": created.flow_id, "flow_version": created.flow_version},
    )
    return created


@router.get("/{session_id}", response_model=CallSession)
def get_session(
    session_id: str,
    access: WorkspaceAccess = Depends(require_viewer_access),
    db: Session = Depends(get_db),
) -> CallSession:
    session = SessionRepository(db, access.workspace_id).get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.post("/{session_id}/input", response_model=CallSession)
def submit_input(
    session_id: str,
    payload: SessionInput,
    access: WorkspaceAccess = Depends(require_editor_access),
    db: Session = Depends(get_db),
) -> CallSession:
    session_repo = SessionRepository(db, access.workspace_id)
    session = session_repo.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    flow = FlowRepository(db, access.workspace_id).get_version(session.flow_id, session.flow_version)
    if not flow:
        raise HTTPException(status_code=409, detail="Session flow version no longer exists")
    expected_revision = session.revision
    try:
        engine.submit_input(flow, session, payload.value)
        saved = session_repo.save(session, expected_revision=expected_revision)
        AuditService(db, access.workspace_id).record(
            actor=access.email or access.user_id or "admin",
            action="session.input_submitted",
            resource_type="session",
            resource_id=session_id,
            details={"status": saved.status},
        )
        return saved
    except FlowEngineError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except SessionConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

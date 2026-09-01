from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import WorkspaceAccess, require_editor_access, require_viewer_access, resolve_agent_identity
from app.core.db import get_db
from app.models import AgentPresenceUpdate, AgentState
from app.services.agent_repository import AgentRepository
from app.services.audit import AuditService

router = APIRouter(prefix="/api/agents", tags=["agents"])


@router.get("", response_model=list[AgentState])
def list_agents(
    access: WorkspaceAccess = Depends(require_viewer_access),
    db: Session = Depends(get_db),
) -> list[AgentState]:
    return AgentRepository(db, access.workspace_id).list()


@router.put("/{agent_name}/presence", response_model=AgentState)
def update_agent_presence(
    agent_name: str,
    payload: AgentPresenceUpdate,
    access: WorkspaceAccess = Depends(require_editor_access),
    db: Session = Depends(get_db),
) -> AgentState:
    normalized_name = resolve_agent_identity(access, agent_name)
    if not normalized_name or len(normalized_name) > 120:
        raise HTTPException(status_code=422, detail="Agent name must contain 1 to 120 visible characters")
    state = AgentRepository(db, access.workspace_id).set_presence(normalized_name, payload.presence)
    AuditService(db, access.workspace_id).record(
        actor=access.email or access.user_id or normalized_name,
        action="agent.presence_updated",
        resource_type="agent",
        resource_id=normalized_name,
        details={"presence": state.presence, "routing_status": state.routing_status},
    )
    return state

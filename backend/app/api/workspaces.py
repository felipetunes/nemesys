from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.auth import WorkspaceAccess, require_admin_access
from app.core.db import get_db
from app.models import (
    WorkspaceMember,
    WorkspaceMemberCreate,
    WorkspaceMemberRoleUpdate,
    WorkspaceMemberStatusUpdate,
    WorkspaceUserCreate,
)
from app.services.audit import AuditService
from app.services.auth import AuthError, AuthService

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])


def _actor(access: WorkspaceAccess) -> str:
    return access.email or access.user_id or "admin"


def _require_owner_for_owner_change(
    access: WorkspaceAccess,
    current_role: str | None,
    requested_role: str | None,
) -> None:
    if access.is_admin or access.role == "owner":
        return
    if current_role == "owner" or requested_role == "owner":
        raise HTTPException(status_code=403, detail="Only an owner can grant or remove workspace ownership")


@router.get("/members", response_model=list[WorkspaceMember])
def list_members(
    access: WorkspaceAccess = Depends(require_admin_access),
    db: Session = Depends(get_db),
) -> list[WorkspaceMember]:
    return AuthService(db).list_workspace_members(access.workspace_id)


@router.post("/members", response_model=WorkspaceMember, status_code=status.HTTP_201_CREATED)
def add_member(
    payload: WorkspaceMemberCreate,
    access: WorkspaceAccess = Depends(require_admin_access),
    db: Session = Depends(get_db),
) -> WorkspaceMember:
    _require_owner_for_owner_change(access, None, payload.role)
    try:
        member = AuthService(db).add_workspace_member(access.workspace_id, payload.email, payload.role)
    except AuthError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    AuditService(db, access.workspace_id).record(
        actor=_actor(access),
        action="workspace.member_added",
        resource_type="user",
        resource_id=member.user_id,
        details={"role": member.role},
    )
    return member


@router.post("/users", response_model=WorkspaceMember, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: WorkspaceUserCreate,
    access: WorkspaceAccess = Depends(require_admin_access),
    db: Session = Depends(get_db),
) -> WorkspaceMember:
    _require_owner_for_owner_change(access, None, payload.role)
    try:
        member = AuthService(db).create_workspace_user(
            access.workspace_id,
            payload.email,
            payload.password,
            payload.role,
        )
    except AuthError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    AuditService(db, access.workspace_id).record(
        actor=_actor(access),
        action="workspace.user_created",
        resource_type="user",
        resource_id=member.user_id,
        details={"role": member.role},
    )
    return member


@router.patch("/members/{user_id}", response_model=WorkspaceMember)
def update_member(
    user_id: str,
    payload: WorkspaceMemberRoleUpdate,
    access: WorkspaceAccess = Depends(require_admin_access),
    db: Session = Depends(get_db),
) -> WorkspaceMember:
    auth = AuthService(db)
    current = next((member for member in auth.list_workspace_members(access.workspace_id) if member.user_id == user_id), None)
    if current is None:
        raise HTTPException(status_code=404, detail="Workspace member not found")
    _require_owner_for_owner_change(access, current.role, payload.role)
    try:
        member = auth.update_workspace_member(access.workspace_id, user_id, payload.role)
    except AuthError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    AuditService(db, access.workspace_id).record(
        actor=_actor(access),
        action="workspace.member_role_updated",
        resource_type="user",
        resource_id=user_id,
        details={"previous_role": current.role, "role": member.role},
    )
    return member


@router.patch("/members/{user_id}/status", response_model=WorkspaceMember)
def update_member_status(
    user_id: str,
    payload: WorkspaceMemberStatusUpdate,
    access: WorkspaceAccess = Depends(require_admin_access),
    db: Session = Depends(get_db),
) -> WorkspaceMember:
    auth = AuthService(db)
    current = next((member for member in auth.list_workspace_members(access.workspace_id) if member.user_id == user_id), None)
    if current is None:
        raise HTTPException(status_code=404, detail="Workspace member not found")
    _require_owner_for_owner_change(access, current.role, current.role)
    try:
        member = auth.set_workspace_member_active(access.workspace_id, user_id, payload.active)
    except AuthError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    AuditService(db, access.workspace_id).record(
        actor=_actor(access),
        action="workspace.member_status_updated",
        resource_type="user",
        resource_id=user_id,
        details={"active": member.active},
    )
    return member


@router.delete("/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    user_id: str,
    access: WorkspaceAccess = Depends(require_admin_access),
    db: Session = Depends(get_db),
) -> Response:
    auth = AuthService(db)
    current = next((member for member in auth.list_workspace_members(access.workspace_id) if member.user_id == user_id), None)
    if current is None:
        raise HTTPException(status_code=404, detail="Workspace member not found")
    _require_owner_for_owner_change(access, current.role, None)
    try:
        auth.remove_workspace_member(access.workspace_id, user_id)
    except AuthError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    AuditService(db, access.workspace_id).record(
        actor=_actor(access),
        action="workspace.member_removed",
        resource_type="user",
        resource_id=user_id,
        details={"previous_role": current.role},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)

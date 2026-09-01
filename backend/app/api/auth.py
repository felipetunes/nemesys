from typing import Annotated, cast

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.auth import WorkspaceAccess, require_viewer_access
from app.core.config import get_settings
from app.core.db import get_db
from app.demo_flow import build_demo_flow
from app.models import (
    AuthCapabilities,
    AuthMe,
    AuthTokenResponse,
    LoginRequest,
    RegisterRequest,
    SupportedLanguage,
    UserProfileUpdate,
    UserRow,
    WorkspaceInfo,
)
from app.services.audit import AuditService
from app.services.auth import AuthError, AuthService
from app.services.flow_repository import FlowRepository

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/capabilities", response_model=AuthCapabilities)
def capabilities(db: Session = Depends(get_db)) -> AuthCapabilities:
    return AuthCapabilities(owner_registration_available=not AuthService(db).has_users())


@router.post("/register", response_model=AuthTokenResponse, status_code=201)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> AuthTokenResponse:
    settings = get_settings()
    auth = AuthService(db)
    if auth.has_users() and not settings.allow_registration:
        raise HTTPException(status_code=403, detail="Registration is disabled")
    try:
        token = auth.register(
            payload.email,
            payload.password,
            payload.workspace_name,
            settings.auth_session_days,
            payload.language,
        )
    except AuthError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    workspace_id = token.workspaces[0].id
    demo = build_demo_flow().model_copy(update={"name": f"{payload.workspace_name.strip()} Demo IVR"})
    repo = FlowRepository(db, workspace_id)
    repo.save(demo)
    repo.publish(demo.id)
    AuditService(db, workspace_id).record(
        actor=token.email,
        action="workspace.registered",
        resource_type="workspace",
        resource_id=workspace_id,
    )
    return token


@router.post("/login", response_model=AuthTokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> AuthTokenResponse:
    settings = get_settings()
    try:
        token = AuthService(db).login(
            payload.email,
            payload.password,
            settings.auth_session_days,
            settings.auth_max_failed_attempts,
            settings.auth_lockout_minutes,
        )
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc), headers={"WWW-Authenticate": "Bearer"}) from exc
    for workspace in token.workspaces:
        AuditService(db, workspace.id).record(
            actor=token.email,
            action="auth.login",
            resource_type="user",
            resource_id=token.user_id,
        )
    return token


@router.get("/me", response_model=AuthMe)
def me(
    access: WorkspaceAccess = Depends(require_viewer_access),
    db: Session = Depends(get_db),
) -> AuthMe:
    if access.user_id is None:
        return AuthMe(
            user_id="admin",
            email="admin",
            language="pt-BR",
            active_workspace_id=access.workspace_id,
            workspaces=[WorkspaceInfo(id=access.workspace_id, name=access.workspace_id, role="admin")],
        )
    user = db.get(UserRow, access.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return AuthMe(
        user_id=access.user_id,
        email=access.email or "",
        language=cast(SupportedLanguage, user.language),
        active_workspace_id=access.workspace_id,
        workspaces=AuthService(db).workspaces_for_user(access.user_id),
    )


@router.patch("/me", response_model=AuthMe)
def update_profile(
    payload: UserProfileUpdate,
    access: WorkspaceAccess = Depends(require_viewer_access),
    db: Session = Depends(get_db),
) -> AuthMe:
    if access.user_id is None:
        raise HTTPException(status_code=403, detail="Operator tokens do not have a user profile")
    try:
        AuthService(db).update_language(access.user_id, payload.language)
    except AuthError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    AuditService(db, access.workspace_id).record(
        actor=access.email or access.user_id,
        action="user.profile_updated",
        resource_type="user",
        resource_id=access.user_id,
        details={"language": payload.language},
    )
    return AuthMe(
        user_id=access.user_id,
        email=access.email or "",
        language=payload.language,
        active_workspace_id=access.workspace_id,
        workspaces=AuthService(db).workspaces_for_user(access.user_id),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
    access: WorkspaceAccess = Depends(require_viewer_access),
    db: Session = Depends(get_db),
) -> Response:
    if authorization and authorization.lower().startswith("bearer ") and not access.is_admin:
        AuditService(db, access.workspace_id).record(
            actor=access.email or access.user_id or "unknown",
            action="auth.logout",
            resource_type="user",
            resource_id=access.user_id,
        )
        AuthService(db).revoke_token(authorization[7:].strip())
    return Response(status_code=status.HTTP_204_NO_CONTENT)

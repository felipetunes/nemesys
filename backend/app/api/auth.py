from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.auth import WorkspaceAccess, require_management_access
from app.core.config import get_settings
from app.core.db import get_db
from app.demo_flow import build_demo_flow
from app.models import AuthMe, AuthTokenResponse, LoginRequest, RegisterRequest, WorkspaceInfo
from app.services.auth import AuthError, AuthService
from app.services.flow_repository import FlowRepository

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=AuthTokenResponse, status_code=201)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> AuthTokenResponse:
    settings = get_settings()
    auth = AuthService(db)
    if auth.has_users() and not settings.allow_registration:
        raise HTTPException(status_code=403, detail="Registration is disabled")
    try:
        token = auth.register(payload.email, payload.password, payload.workspace_name, settings.auth_session_days)
    except AuthError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    workspace_id = token.workspaces[0].id
    demo = build_demo_flow().model_copy(
        update={"id": f"demo-{workspace_id[:8]}", "name": f"{payload.workspace_name.strip()} Demo IVR"}
    )
    repo = FlowRepository(db, workspace_id)
    repo.save(demo)
    repo.publish(demo.id)
    return token


@router.post("/login", response_model=AuthTokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> AuthTokenResponse:
    try:
        return AuthService(db).login(payload.email, payload.password, get_settings().auth_session_days)
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc), headers={"WWW-Authenticate": "Bearer"}) from exc


@router.get("/me", response_model=AuthMe)
def me(
    access: WorkspaceAccess = Depends(require_management_access),
    db: Session = Depends(get_db),
) -> AuthMe:
    if access.user_id is None:
        return AuthMe(
            user_id="admin",
            email="admin",
            active_workspace_id=access.workspace_id,
            workspaces=[WorkspaceInfo(id=access.workspace_id, name=access.workspace_id, role="admin")],
        )
    return AuthMe(
        user_id=access.user_id,
        email=access.email or "",
        active_workspace_id=access.workspace_id,
        workspaces=AuthService(db).workspaces_for_user(access.user_id),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
    access: WorkspaceAccess = Depends(require_management_access),
    db: Session = Depends(get_db),
) -> Response:
    if authorization and authorization.lower().startswith("bearer ") and not access.is_admin:
        AuthService(db).revoke_token(authorization[7:].strip())
    return Response(status_code=status.HTTP_204_NO_CONTENT)

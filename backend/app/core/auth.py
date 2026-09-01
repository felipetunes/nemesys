import secrets
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.services.auth import AuthError, AuthService

bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class WorkspaceAccess:
    workspace_id: str
    user_id: str | None = None
    email: str | None = None
    role: str = "owner"
    is_admin: bool = False


def require_management_access(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    workspace_id: Annotated[str | None, Header(alias="X-Workspace-ID")] = None,
    db: Session = Depends(get_db),
) -> WorkspaceAccess:
    settings = get_settings()
    configured_key = settings.admin_api_key
    requested_workspace = workspace_id or "default"

    if credentials is not None and credentials.scheme.lower() == "bearer":
        token = credentials.credentials
        if configured_key and secrets.compare_digest(token, configured_key):
            return WorkspaceAccess(workspace_id=requested_workspace, is_admin=True)
        try:
            user = AuthService(db).resolve_token(token, workspace_id)
        except AuthError as exc:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
        if user is not None:
            return WorkspaceAccess(
                workspace_id=user.workspace_id,
                user_id=user.user_id,
                email=user.email,
                role=user.role,
            )

    if not settings.auth_required and not configured_key:
        return WorkspaceAccess(workspace_id="default")
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Management API token required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired API token",
        headers={"WWW-Authenticate": "Bearer"},
    )

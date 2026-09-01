import base64
import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    AuthSessionRow,
    AuthTokenResponse,
    UserRow,
    WorkspaceInfo,
    WorkspaceMembershipRow,
    WorkspaceRow,
)

PASSWORD_ITERATIONS = 600_000


class AuthError(RuntimeError):
    pass


@dataclass(frozen=True)
class AuthenticatedUser:
    user_id: str
    email: str
    workspace_id: str
    role: str


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PASSWORD_ITERATIONS)
    return "$".join(
        (
            "pbkdf2_sha256",
            str(PASSWORD_ITERATIONS),
            base64.urlsafe_b64encode(salt).decode(),
            base64.urlsafe_b64encode(derived).decode(),
        )
    )


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations, salt_value, expected_value = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        salt = base64.urlsafe_b64decode(salt_value.encode())
        expected = base64.urlsafe_b64decode(expected_value.encode())
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, int(iterations))
        return secrets.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


class AuthService:
    def __init__(self, db: Session):
        self.db = db

    def ensure_default_workspace(self) -> None:
        if self.db.get(WorkspaceRow, "default") is None:
            self.db.add(WorkspaceRow(id="default", name="Offline demo"))
            self.db.commit()

    def has_users(self) -> bool:
        return bool(self.db.scalar(select(func.count()).select_from(UserRow)))

    def register(self, email: str, password: str, workspace_name: str, session_days: int) -> AuthTokenResponse:
        normalized_email = email.strip().lower()
        if self.db.scalar(select(UserRow).where(UserRow.email == normalized_email)) is not None:
            raise AuthError("An account with this email already exists")
        user_id = str(uuid4())
        workspace_id = str(uuid4())
        self.db.add(UserRow(id=user_id, email=normalized_email, password_hash=hash_password(password)))
        self.db.add(WorkspaceRow(id=workspace_id, name=workspace_name.strip()))
        self.db.add(WorkspaceMembershipRow(user_id=user_id, workspace_id=workspace_id, role="owner"))
        self.db.commit()
        return self._issue_token(user_id, normalized_email, session_days)

    def login(self, email: str, password: str, session_days: int) -> AuthTokenResponse:
        normalized_email = email.strip().lower()
        user = self.db.scalar(select(UserRow).where(UserRow.email == normalized_email))
        if user is None or not verify_password(password, user.password_hash):
            raise AuthError("Invalid email or password")
        return self._issue_token(user.id, user.email, session_days)

    def resolve_token(self, token: str, requested_workspace_id: str | None) -> AuthenticatedUser | None:
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        auth_session = self.db.get(AuthSessionRow, token_hash)
        if auth_session is None:
            return None
        expires_at = auth_session.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        if expires_at <= datetime.now(UTC):
            self.db.delete(auth_session)
            self.db.commit()
            return None
        user = self.db.get(UserRow, auth_session.user_id)
        if user is None:
            return None
        memberships = self._memberships(user.id)
        membership = next(
            (item for item in memberships if item.workspace_id == requested_workspace_id),
            memberships[0] if memberships and requested_workspace_id is None else None,
        )
        if membership is None:
            raise AuthError("User is not a member of the requested workspace")
        return AuthenticatedUser(
            user_id=user.id,
            email=user.email,
            workspace_id=membership.workspace_id,
            role=membership.role,
        )

    def revoke_token(self, token: str) -> None:
        row = self.db.get(AuthSessionRow, hashlib.sha256(token.encode()).hexdigest())
        if row is not None:
            self.db.delete(row)
            self.db.commit()

    def workspaces_for_user(self, user_id: str) -> list[WorkspaceInfo]:
        memberships = self._memberships(user_id)
        workspace_ids = [membership.workspace_id for membership in memberships]
        rows = self.db.scalars(select(WorkspaceRow).where(WorkspaceRow.id.in_(workspace_ids))).all()
        names = {row.id: row.name for row in rows}
        return [
            WorkspaceInfo(id=item.workspace_id, name=names.get(item.workspace_id, item.workspace_id), role=item.role)
            for item in memberships
        ]

    def _issue_token(self, user_id: str, email: str, session_days: int) -> AuthTokenResponse:
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(UTC) + timedelta(days=session_days)
        self.db.add(
            AuthSessionRow(
                token_hash=hashlib.sha256(token.encode()).hexdigest(),
                user_id=user_id,
                expires_at=expires_at,
            )
        )
        self.db.commit()
        return AuthTokenResponse(
            token=token,
            expires_at=expires_at,
            user_id=user_id,
            email=email,
            workspaces=self.workspaces_for_user(user_id),
        )

    def _memberships(self, user_id: str) -> list[WorkspaceMembershipRow]:
        return list(
            self.db.scalars(
                select(WorkspaceMembershipRow)
                .where(WorkspaceMembershipRow.user_id == user_id)
                .order_by(WorkspaceMembershipRow.workspace_id)
            ).all()
        )

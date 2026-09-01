import json
from datetime import UTC, datetime
from typing import Any, cast

from sqlalchemy import select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import CallSession, SessionRow


class SessionConflictError(RuntimeError):
    pass


class SessionRepository:
    def __init__(self, db: Session, workspace_id: str = "default"):
        self.db = db
        self.workspace_id = workspace_id

    def create(
        self,
        session: CallSession,
        *,
        provider: str | None = None,
        provider_call_id: str | None = None,
    ) -> CallSession:
        payload = session.model_copy(update={"revision": 0})
        self.db.add(
            SessionRow(
                id=payload.id,
                workspace_id=self.workspace_id,
                flow_id=payload.flow_id,
                flow_version=payload.flow_version,
                status=payload.status,
                session_json=payload.model_dump_json(),
                provider=provider,
                provider_call_id=provider_call_id,
                revision=0,
                updated_at=datetime.now(UTC),
            )
        )
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            if provider and provider_call_id:
                existing = self.get_by_provider_call(provider, provider_call_id)
                if existing is not None:
                    return existing
            raise
        return payload

    def get(self, session_id: str) -> CallSession | None:
        row = self.db.scalar(
            select(SessionRow).where(
                SessionRow.id == session_id,
                SessionRow.workspace_id == self.workspace_id,
            )
        )
        return self._to_model(row) if row else None

    def get_by_provider_call(self, provider: str, provider_call_id: str) -> CallSession | None:
        row = self.db.scalar(
            select(SessionRow).where(
                SessionRow.provider == provider,
                SessionRow.provider_call_id == provider_call_id,
                SessionRow.workspace_id == self.workspace_id,
            )
        )
        return self._to_model(row) if row else None

    def list_by_status(self, status: str) -> list[CallSession]:
        rows = self.db.scalars(
            select(SessionRow)
            .where(SessionRow.status == status, SessionRow.workspace_id == self.workspace_id)
            .order_by(SessionRow.updated_at)
        ).all()
        return [self._to_model(row) for row in rows]

    def save(self, session: CallSession, *, expected_revision: int) -> CallSession:
        next_revision = expected_revision + 1
        payload = session.model_copy(update={"revision": next_revision})
        result = cast(
            CursorResult[Any],
            self.db.execute(
                update(SessionRow)
                .where(
                    SessionRow.id == session.id,
                    SessionRow.revision == expected_revision,
                    SessionRow.workspace_id == self.workspace_id,
                )
                .values(
                    status=payload.status,
                    session_json=payload.model_dump_json(),
                    revision=next_revision,
                    updated_at=datetime.now(UTC),
                )
            ),
        )
        if result.rowcount != 1:
            self.db.rollback()
            raise SessionConflictError(f"Session '{session.id}' was updated concurrently")
        self.db.commit()
        return payload

    @staticmethod
    def _to_model(row: SessionRow) -> CallSession:
        data = json.loads(row.session_json)
        data["flow_id"] = row.flow_id
        data["flow_version"] = row.flow_version
        data["revision"] = row.revision
        return CallSession.model_validate(data)

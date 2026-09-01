import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditEvent, AuditEventRow


class AuditService:
    def __init__(self, db: Session, workspace_id: str):
        self.db = db
        self.workspace_id = workspace_id

    def record(
        self,
        *,
        actor: str,
        action: str,
        resource_type: str,
        resource_id: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> AuditEvent:
        row = AuditEventRow(
            id=str(uuid4()),
            workspace_id=self.workspace_id,
            actor=actor,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details_json=json.dumps(details or {}, separators=(",", ":"), sort_keys=True),
            created_at=datetime.now(UTC),
        )
        self.db.add(row)
        self.db.commit()
        return self._to_model(row)

    def list_recent(self, limit: int = 100) -> list[AuditEvent]:
        rows = self.db.scalars(
            select(AuditEventRow)
            .where(AuditEventRow.workspace_id == self.workspace_id)
            .order_by(AuditEventRow.created_at.desc())
            .limit(limit)
        ).all()
        return [self._to_model(row) for row in rows]

    @staticmethod
    def _to_model(row: AuditEventRow) -> AuditEvent:
        return AuditEvent(
            id=row.id,
            workspace_id=row.workspace_id,
            actor=row.actor,
            action=row.action,
            resource_type=row.resource_type,
            resource_id=row.resource_id,
            details=json.loads(row.details_json),
            created_at=row.created_at,
        )

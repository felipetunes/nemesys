from datetime import UTC, datetime, timedelta
from typing import Any, cast

from sqlalchemy import delete
from sqlalchemy.engine import CursorResult
from sqlalchemy.orm import Session

from app.models import RetentionResult, SessionRow


class RetentionService:
    def __init__(self, db: Session, workspace_id: str = "default"):
        self.db = db
        self.workspace_id = workspace_id

    def prune_terminal_sessions(self, retention_days: int) -> RetentionResult:
        cutoff = datetime.now(UTC) - timedelta(days=retention_days)
        if retention_days <= 0:
            return RetentionResult(retention_days=retention_days, cutoff=cutoff, deleted_sessions=0)
        result = cast(
            CursorResult[Any],
            self.db.execute(
                delete(SessionRow).where(
                    SessionRow.status.in_(("completed", "failed")),
                    SessionRow.updated_at < cutoff,
                    SessionRow.workspace_id == self.workspace_id,
                )
            ),
        )
        self.db.commit()
        return RetentionResult(
            retention_days=retention_days,
            cutoff=cutoff,
            deleted_sessions=result.rowcount or 0,
        )

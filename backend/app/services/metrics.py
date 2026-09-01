import json
from collections import Counter
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CallSession, MetricsSummary, SessionRow


class MetricsService:
    def __init__(self, db: Session, workspace_id: str = "default"):
        self.db = db
        self.workspace_id = workspace_id

    def summary(self) -> MetricsSummary:
        rows = self.db.scalars(select(SessionRow).where(SessionRow.workspace_id == self.workspace_id)).all()
        status_counts: Counter[str] = Counter()
        intent_counts: Counter[str] = Counter()
        channel_counts: Counter[str] = Counter()
        durations: list[float] = []
        recent_cutoff = datetime.now(UTC) - timedelta(hours=24)
        recent = 0

        for row in rows:
            status_counts[row.status] += 1
            updated_at = row.updated_at
            if updated_at.tzinfo is None:
                updated_at = updated_at.replace(tzinfo=UTC)
            if updated_at >= recent_cutoff:
                recent += 1

            session = CallSession.model_validate(json.loads(row.session_json))
            intent = session.variables.get("intent")
            if intent:
                intent_counts[str(intent)] += 1
            channel_counts[str(session.variables.get("channel", "browser"))] += 1
            if session.status in {"completed", "failed"} and len(session.trace) >= 2:
                duration = (session.trace[-1].timestamp - session.trace[0].timestamp).total_seconds()
                durations.append(max(duration, 0))

        total = len(rows)
        completed = status_counts["completed"]
        return MetricsSummary(
            total_sessions=total,
            sessions_last_24h=recent,
            status_counts=dict(status_counts),
            intent_counts=dict(intent_counts),
            channel_counts=dict(channel_counts),
            completion_rate=(completed / total) if total else 0,
            average_duration_seconds=(sum(durations) / len(durations)) if durations else 0,
        )

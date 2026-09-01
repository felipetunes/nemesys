from datetime import UTC, datetime
from typing import cast

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AgentPresence, AgentRoutingStatus, AgentState, AgentStateRow


class AgentRepository:
    def __init__(self, db: Session, workspace_id: str = "default"):
        self.db = db
        self.workspace_id = workspace_id

    def list(self) -> list[AgentState]:
        rows = self.db.scalars(
            select(AgentStateRow)
            .where(AgentStateRow.workspace_id == self.workspace_id)
            .order_by(AgentStateRow.agent_name)
        ).all()
        return [self._to_model(row) for row in rows]

    def get(self, agent_name: str) -> AgentState | None:
        row = self.db.get(AgentStateRow, (self.workspace_id, agent_name.strip()))
        return self._to_model(row) if row else None

    def set_presence(self, agent_name: str, presence: AgentPresence) -> AgentState:
        normalized_name = agent_name.strip()
        row = self.db.get(AgentStateRow, (self.workspace_id, normalized_name))
        now = datetime.now(UTC)
        if row is None:
            row = AgentStateRow(
                workspace_id=self.workspace_id,
                agent_name=normalized_name,
                presence=presence,
                routing_status="idle" if presence == "on_queue" else "off_queue",
                updated_at=now,
            )
            self.db.add(row)
        else:
            row.presence = presence
            if row.routing_status != "interacting":
                row.routing_status = "idle" if presence == "on_queue" else "off_queue"
            row.updated_at = now
        self.db.commit()
        return self._to_model(row)

    def set_routing_status(self, agent_name: str, routing_status: AgentRoutingStatus) -> AgentState | None:
        row = self.db.get(AgentStateRow, (self.workspace_id, agent_name.strip()))
        if row is None:
            return None
        row.routing_status = routing_status
        row.updated_at = datetime.now(UTC)
        self.db.commit()
        return self._to_model(row)

    def finish_interaction(self, agent_name: str) -> AgentState | None:
        state = self.get(agent_name)
        if state is None:
            return None
        return self.set_routing_status(agent_name, "idle" if state.presence == "on_queue" else "off_queue")

    @staticmethod
    def _to_model(row: AgentStateRow) -> AgentState:
        return AgentState(
            agent_name=row.agent_name,
            presence=cast(AgentPresence, row.presence),
            routing_status=cast(AgentRoutingStatus, row.routing_status),
            updated_at=row.updated_at,
        )

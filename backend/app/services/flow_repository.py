from __future__ import annotations

import json
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import FlowDefinition, FlowRow, FlowVersionRow


class FlowRepository:
    def __init__(self, db: Session, workspace_id: str = "default"):
        self.db = db
        self.workspace_id = workspace_id

    def list_drafts(self) -> list[FlowDefinition]:
        rows = self.db.scalars(
            select(FlowRow).where(FlowRow.workspace_id == self.workspace_id).order_by(FlowRow.name)
        ).all()
        return [self._draft_to_model(row) for row in rows]

    def get(self, flow_id: str) -> FlowDefinition | None:
        row = self.db.scalar(
            select(FlowRow).where(FlowRow.id == flow_id, FlowRow.workspace_id == self.workspace_id)
        )
        return self._draft_to_model(row) if row else None

    def save(self, flow: FlowDefinition) -> FlowDefinition:
        now = datetime.now(UTC)
        payload = flow.model_copy(update={"updated_at": now, "version": None, "published_at": None})
        row = self.db.get(FlowRow, (self.workspace_id, flow.id))
        if row is None:
            row = FlowRow(
                id=flow.id,
                workspace_id=self.workspace_id,
                name=flow.name,
                description=flow.description,
                definition_json=payload.model_dump_json(),
                updated_at=now,
            )
            self.db.add(row)
        else:
            row.name = flow.name
            row.description = flow.description
            row.definition_json = payload.model_dump_json()
            row.updated_at = now
        self.db.commit()
        return payload

    def publish(self, flow_id: str) -> FlowDefinition | None:
        draft = self.get(flow_id)
        if draft is None:
            return None
        latest = self.db.scalar(
            select(func.max(FlowVersionRow.version)).where(
                FlowVersionRow.flow_id == flow_id,
                FlowVersionRow.workspace_id == self.workspace_id,
            )
        )
        version = (latest or 0) + 1
        published_at = datetime.now(UTC)
        payload = draft.model_copy(update={"version": version, "published_at": published_at})
        self.db.add(
            FlowVersionRow(
                flow_id=flow_id,
                version=version,
                workspace_id=self.workspace_id,
                definition_json=payload.model_dump_json(),
                published_at=published_at,
            )
        )
        self.db.commit()
        return payload

    def get_published(self, flow_id: str) -> FlowDefinition | None:
        row = self.db.scalar(
            select(FlowVersionRow)
            .where(
                FlowVersionRow.flow_id == flow_id,
                FlowVersionRow.workspace_id == self.workspace_id,
            )
            .order_by(FlowVersionRow.version.desc())
            .limit(1)
        )
        return self._version_to_model(row) if row else None

    def get_version(self, flow_id: str, version: int) -> FlowDefinition | None:
        row = self.db.scalar(
            select(FlowVersionRow).where(
                FlowVersionRow.flow_id == flow_id,
                FlowVersionRow.version == version,
                FlowVersionRow.workspace_id == self.workspace_id,
            )
        )
        return self._version_to_model(row) if row else None

    def list_versions(self, flow_id: str) -> list[FlowDefinition]:
        rows = self.db.scalars(
            select(FlowVersionRow)
            .where(
                FlowVersionRow.flow_id == flow_id,
                FlowVersionRow.workspace_id == self.workspace_id,
            )
            .order_by(FlowVersionRow.version.desc())
        ).all()
        return [self._version_to_model(row) for row in rows]

    @staticmethod
    def _draft_to_model(row: FlowRow) -> FlowDefinition:
        data = json.loads(row.definition_json)
        data["updated_at"] = row.updated_at
        data["version"] = None
        data["published_at"] = None
        return FlowDefinition.model_validate(data)

    @staticmethod
    def _version_to_model(row: FlowVersionRow) -> FlowDefinition:
        data = json.loads(row.definition_json)
        data["version"] = row.version
        data["published_at"] = row.published_at
        return FlowDefinition.model_validate(data)

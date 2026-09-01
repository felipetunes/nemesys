from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.auth import WorkspaceAccess, require_admin_access, require_viewer_access
from app.core.config import get_settings
from app.core.db import get_db
from app.models import AuditEvent, MetricsSummary, RetentionResult
from app.services.audit import AuditService
from app.services.metrics import MetricsService
from app.services.retention import RetentionService

router = APIRouter(prefix="/api/operations", tags=["operations"])


@router.get("/metrics", response_model=MetricsSummary)
def get_metrics(
    access: WorkspaceAccess = Depends(require_viewer_access),
    db: Session = Depends(get_db),
) -> MetricsSummary:
    return MetricsService(db, access.workspace_id).summary()


@router.post("/retention/run", response_model=RetentionResult)
def run_retention(
    access: WorkspaceAccess = Depends(require_admin_access),
    db: Session = Depends(get_db),
) -> RetentionResult:
    result = RetentionService(db, access.workspace_id).prune_terminal_sessions(get_settings().session_retention_days)
    AuditService(db, access.workspace_id).record(
        actor=access.email or access.user_id or "admin",
        action="retention.executed",
        resource_type="workspace",
        resource_id=access.workspace_id,
        details={"deleted_sessions": result.deleted_sessions, "retention_days": result.retention_days},
    )
    return result


@router.get("/audit", response_model=list[AuditEvent])
def get_audit_events(
    limit: int = Query(default=100, ge=1, le=500),
    access: WorkspaceAccess = Depends(require_admin_access),
    db: Session = Depends(get_db),
) -> list[AuditEvent]:
    return AuditService(db, access.workspace_id).list_recent(limit)

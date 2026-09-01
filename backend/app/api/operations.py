from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import WorkspaceAccess, require_management_access
from app.core.config import get_settings
from app.core.db import get_db
from app.models import MetricsSummary, RetentionResult
from app.services.metrics import MetricsService
from app.services.retention import RetentionService

router = APIRouter(prefix="/api/operations", tags=["operations"])


@router.get("/metrics", response_model=MetricsSummary)
def get_metrics(
    access: WorkspaceAccess = Depends(require_management_access),
    db: Session = Depends(get_db),
) -> MetricsSummary:
    return MetricsService(db, access.workspace_id).summary()


@router.post("/retention/run", response_model=RetentionResult)
def run_retention(
    access: WorkspaceAccess = Depends(require_management_access),
    db: Session = Depends(get_db),
) -> RetentionResult:
    return RetentionService(db, access.workspace_id).prune_terminal_sessions(get_settings().session_retention_days)

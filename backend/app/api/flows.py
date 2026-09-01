from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.auth import WorkspaceAccess, require_admin_access, require_editor_access, require_viewer_access
from app.core.db import get_db
from app.models import FlowDefinition, FlowDuplicateRequest
from app.services.audit import AuditService
from app.services.flow_repository import FlowRepository
from app.services.flow_validator import FlowValidationResult, validate_flow

router = APIRouter(prefix="/api/flows", tags=["flows"])


@router.get("", response_model=list[FlowDefinition])
def list_flows(
    include_archived: bool = Query(default=False),
    access: WorkspaceAccess = Depends(require_viewer_access),
    db: Session = Depends(get_db),
) -> list[FlowDefinition]:
    return FlowRepository(db, access.workspace_id).list_drafts(include_archived=include_archived)


@router.get("/{flow_id}", response_model=FlowDefinition)
def get_flow(
    flow_id: str,
    access: WorkspaceAccess = Depends(require_viewer_access),
    db: Session = Depends(get_db),
) -> FlowDefinition:
    flow = FlowRepository(db, access.workspace_id).get(flow_id)
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    return flow


@router.post("/actions/validate", response_model=FlowValidationResult)
def validate_flow_definition(
    flow: FlowDefinition,
    _: WorkspaceAccess = Depends(require_viewer_access),
) -> FlowValidationResult:
    return validate_flow(flow)


@router.post("/actions/import", response_model=FlowDefinition, status_code=201)
def import_flow_definition(
    flow: FlowDefinition,
    overwrite: bool = Query(default=False),
    access: WorkspaceAccess = Depends(require_editor_access),
    db: Session = Depends(get_db),
) -> FlowDefinition:
    repo = FlowRepository(db, access.workspace_id)
    existing = repo.get(flow.id)
    if existing is not None and existing.archived_at is not None:
        raise HTTPException(status_code=409, detail="Archived flow must be restored before it can be overwritten")
    if existing is not None and not overwrite:
        raise HTTPException(status_code=409, detail="Flow already exists; set overwrite=true to replace its draft")
    validation = validate_flow(flow)
    if not validation.valid:
        raise HTTPException(
            status_code=422,
            detail={"message": "Flow validation failed", "errors": [issue.model_dump() for issue in validation.errors]},
        )
    saved = repo.save(flow)
    AuditService(db, access.workspace_id).record(
        actor=access.email or access.user_id or "admin",
        action="flow.imported",
        resource_type="flow",
        resource_id=flow.id,
        details={"overwrite": overwrite},
    )
    return saved


@router.post("/{flow_id}/duplicate", response_model=FlowDefinition, status_code=201)
def duplicate_flow(
    flow_id: str,
    payload: FlowDuplicateRequest,
    access: WorkspaceAccess = Depends(require_editor_access),
    db: Session = Depends(get_db),
) -> FlowDefinition:
    repo = FlowRepository(db, access.workspace_id)
    if repo.get(flow_id) is None:
        raise HTTPException(status_code=404, detail="Flow not found")
    if repo.get(payload.id) is not None:
        raise HTTPException(status_code=409, detail="Target flow already exists")
    duplicate = repo.duplicate(flow_id, payload.id, payload.name, payload.description)
    if duplicate is None:
        raise HTTPException(status_code=404, detail="Flow not found")
    AuditService(db, access.workspace_id).record(
        actor=access.email or access.user_id or "admin",
        action="flow.duplicated",
        resource_type="flow",
        resource_id=duplicate.id,
        details={"source_flow_id": flow_id},
    )
    return duplicate


@router.post("/{flow_id}/archive", response_model=FlowDefinition)
def archive_flow(
    flow_id: str,
    access: WorkspaceAccess = Depends(require_editor_access),
    db: Session = Depends(get_db),
) -> FlowDefinition:
    archived = FlowRepository(db, access.workspace_id).archive(flow_id)
    if archived is None:
        raise HTTPException(status_code=404, detail="Flow not found")
    AuditService(db, access.workspace_id).record(
        actor=access.email or access.user_id or "admin",
        action="flow.archived",
        resource_type="flow",
        resource_id=flow_id,
    )
    return archived


@router.post("/{flow_id}/restore", response_model=FlowDefinition)
def restore_flow(
    flow_id: str,
    access: WorkspaceAccess = Depends(require_editor_access),
    db: Session = Depends(get_db),
) -> FlowDefinition:
    restored = FlowRepository(db, access.workspace_id).restore(flow_id)
    if restored is None:
        raise HTTPException(status_code=404, detail="Flow not found")
    AuditService(db, access.workspace_id).record(
        actor=access.email or access.user_id or "admin",
        action="flow.restored",
        resource_type="flow",
        resource_id=flow_id,
    )
    return restored


@router.delete("/{flow_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_flow(
    flow_id: str,
    access: WorkspaceAccess = Depends(require_admin_access),
    db: Session = Depends(get_db),
) -> Response:
    repo = FlowRepository(db, access.workspace_id)
    flow = repo.get(flow_id)
    if flow is None:
        raise HTTPException(status_code=404, detail="Flow not found")
    if flow.archived_at is None:
        raise HTTPException(status_code=409, detail="Flow must be archived before permanent deletion")
    if repo.has_sessions(flow_id):
        raise HTTPException(status_code=409, detail="Flow has session history and cannot be permanently deleted")
    if not repo.delete_permanently(flow_id):
        raise HTTPException(status_code=409, detail="Flow lifecycle changed; reload and try again")
    AuditService(db, access.workspace_id).record(
        actor=access.email or access.user_id or "admin",
        action="flow.deleted",
        resource_type="flow",
        resource_id=flow_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{flow_id}/export")
def export_flow_definition(
    flow_id: str,
    access: WorkspaceAccess = Depends(require_viewer_access),
    db: Session = Depends(get_db),
) -> JSONResponse:
    flow = FlowRepository(db, access.workspace_id).get(flow_id)
    if flow is None:
        raise HTTPException(status_code=404, detail="Flow not found")
    portable = flow.model_copy(
        update={"version": None, "published_at": None, "updated_at": None, "archived_at": None}
    )
    return JSONResponse(
        content=jsonable_encoder(portable, exclude_none=True),
        headers={"Content-Disposition": f'attachment; filename="{flow.id}.flow.json"'},
    )


@router.get("/{flow_id}/versions", response_model=list[FlowDefinition])
def list_flow_versions(
    flow_id: str,
    access: WorkspaceAccess = Depends(require_viewer_access),
    db: Session = Depends(get_db),
) -> list[FlowDefinition]:
    repo = FlowRepository(db, access.workspace_id)
    if repo.get(flow_id) is None:
        raise HTTPException(status_code=404, detail="Flow not found")
    return repo.list_versions(flow_id)


@router.get("/{flow_id}/versions/{version}", response_model=FlowDefinition)
def get_flow_version(
    flow_id: str,
    version: int,
    access: WorkspaceAccess = Depends(require_viewer_access),
    db: Session = Depends(get_db),
) -> FlowDefinition:
    flow = FlowRepository(db, access.workspace_id).get_version(flow_id, version)
    if flow is None:
        raise HTTPException(status_code=404, detail="Flow version not found")
    return flow


@router.post("/{flow_id}/publish", response_model=FlowDefinition)
def publish_flow(
    flow_id: str,
    access: WorkspaceAccess = Depends(require_editor_access),
    db: Session = Depends(get_db),
) -> FlowDefinition:
    repo = FlowRepository(db, access.workspace_id)
    draft = repo.get(flow_id)
    if draft is None:
        raise HTTPException(status_code=404, detail="Flow not found")
    if draft.archived_at is not None:
        raise HTTPException(status_code=409, detail="Archived flow must be restored before publishing")
    validation = validate_flow(draft)
    if not validation.valid:
        raise HTTPException(
            status_code=422,
            detail={"message": "Flow validation failed", "errors": [issue.model_dump() for issue in validation.errors]},
        )
    published = repo.publish(flow_id)
    if published is None:
        raise HTTPException(status_code=404, detail="Flow not found")
    AuditService(db, access.workspace_id).record(
        actor=access.email or access.user_id or "admin",
        action="flow.published",
        resource_type="flow",
        resource_id=flow_id,
        details={"version": published.version},
    )
    return published


@router.post("/{flow_id}/versions/{version}/restore", response_model=FlowDefinition)
def restore_flow_version(
    flow_id: str,
    version: int,
    access: WorkspaceAccess = Depends(require_editor_access),
    db: Session = Depends(get_db),
) -> FlowDefinition:
    repo = FlowRepository(db, access.workspace_id)
    draft = repo.get(flow_id)
    if draft is None:
        raise HTTPException(status_code=404, detail="Flow not found")
    if draft.archived_at is not None:
        raise HTTPException(status_code=409, detail="Archived flow must be restored before restoring a version")
    restored = repo.restore_version(flow_id, version)
    if restored is None:
        raise HTTPException(status_code=404, detail="Flow version not found")
    AuditService(db, access.workspace_id).record(
        actor=access.email or access.user_id or "admin",
        action="flow.version_restored",
        resource_type="flow",
        resource_id=flow_id,
        details={"version": version},
    )
    return restored


@router.put("/{flow_id}", response_model=FlowDefinition)
def save_flow(
    flow_id: str,
    flow: FlowDefinition,
    access: WorkspaceAccess = Depends(require_editor_access),
    db: Session = Depends(get_db),
) -> FlowDefinition:
    if flow.id != flow_id:
        raise HTTPException(status_code=400, detail="Path flow_id must match body id")
    existing = FlowRepository(db, access.workspace_id).get(flow_id)
    if existing is not None and existing.archived_at is not None:
        raise HTTPException(status_code=409, detail="Archived flow must be restored before saving")
    validation = validate_flow(flow)
    if not validation.valid:
        raise HTTPException(
            status_code=422,
            detail={"message": "Flow validation failed", "errors": [x.model_dump() for x in validation.errors]},
        )
    saved = FlowRepository(db, access.workspace_id).save(flow)
    AuditService(db, access.workspace_id).record(
        actor=access.email or access.user_id or "admin",
        action="flow.saved",
        resource_type="flow",
        resource_id=flow_id,
    )
    return saved

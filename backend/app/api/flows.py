from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.auth import WorkspaceAccess, require_management_access
from app.core.db import get_db
from app.models import FlowDefinition
from app.services.flow_repository import FlowIdentifierConflictError, FlowRepository
from app.services.flow_validator import FlowValidationResult, validate_flow

router = APIRouter(prefix="/api/flows", tags=["flows"])


@router.get("", response_model=list[FlowDefinition])
def list_flows(
    access: WorkspaceAccess = Depends(require_management_access),
    db: Session = Depends(get_db),
) -> list[FlowDefinition]:
    return FlowRepository(db, access.workspace_id).list_drafts()


@router.get("/{flow_id}", response_model=FlowDefinition)
def get_flow(
    flow_id: str,
    access: WorkspaceAccess = Depends(require_management_access),
    db: Session = Depends(get_db),
) -> FlowDefinition:
    flow = FlowRepository(db, access.workspace_id).get(flow_id)
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    return flow


@router.post("/actions/validate", response_model=FlowValidationResult)
def validate_flow_definition(
    flow: FlowDefinition,
    _: WorkspaceAccess = Depends(require_management_access),
) -> FlowValidationResult:
    return validate_flow(flow)


@router.post("/actions/import", response_model=FlowDefinition, status_code=201)
def import_flow_definition(
    flow: FlowDefinition,
    overwrite: bool = Query(default=False),
    access: WorkspaceAccess = Depends(require_management_access),
    db: Session = Depends(get_db),
) -> FlowDefinition:
    repo = FlowRepository(db, access.workspace_id)
    if repo.get(flow.id) is not None and not overwrite:
        raise HTTPException(status_code=409, detail="Flow already exists; set overwrite=true to replace its draft")
    validation = validate_flow(flow)
    if not validation.valid:
        raise HTTPException(
            status_code=422,
            detail={"message": "Flow validation failed", "errors": [issue.model_dump() for issue in validation.errors]},
        )
    try:
        return repo.save(flow)
    except FlowIdentifierConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/{flow_id}/export")
def export_flow_definition(
    flow_id: str,
    access: WorkspaceAccess = Depends(require_management_access),
    db: Session = Depends(get_db),
) -> JSONResponse:
    flow = FlowRepository(db, access.workspace_id).get(flow_id)
    if flow is None:
        raise HTTPException(status_code=404, detail="Flow not found")
    portable = flow.model_copy(update={"version": None, "published_at": None, "updated_at": None})
    return JSONResponse(
        content=jsonable_encoder(portable, exclude_none=True),
        headers={"Content-Disposition": f'attachment; filename="{flow.id}.flow.json"'},
    )


@router.get("/{flow_id}/versions", response_model=list[FlowDefinition])
def list_flow_versions(
    flow_id: str,
    access: WorkspaceAccess = Depends(require_management_access),
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
    access: WorkspaceAccess = Depends(require_management_access),
    db: Session = Depends(get_db),
) -> FlowDefinition:
    flow = FlowRepository(db, access.workspace_id).get_version(flow_id, version)
    if flow is None:
        raise HTTPException(status_code=404, detail="Flow version not found")
    return flow


@router.post("/{flow_id}/publish", response_model=FlowDefinition)
def publish_flow(
    flow_id: str,
    access: WorkspaceAccess = Depends(require_management_access),
    db: Session = Depends(get_db),
) -> FlowDefinition:
    repo = FlowRepository(db, access.workspace_id)
    draft = repo.get(flow_id)
    if draft is None:
        raise HTTPException(status_code=404, detail="Flow not found")
    validation = validate_flow(draft)
    if not validation.valid:
        raise HTTPException(
            status_code=422,
            detail={"message": "Flow validation failed", "errors": [issue.model_dump() for issue in validation.errors]},
        )
    published = repo.publish(flow_id)
    if published is None:
        raise HTTPException(status_code=404, detail="Flow not found")
    return published


@router.put("/{flow_id}", response_model=FlowDefinition)
def save_flow(
    flow_id: str,
    flow: FlowDefinition,
    access: WorkspaceAccess = Depends(require_management_access),
    db: Session = Depends(get_db),
) -> FlowDefinition:
    if flow.id != flow_id:
        raise HTTPException(status_code=400, detail="Path flow_id must match body id")
    validation = validate_flow(flow)
    if not validation.valid:
        raise HTTPException(
            status_code=422,
            detail={"message": "Flow validation failed", "errors": [x.model_dump() for x in validation.errors]},
        )
    try:
        return FlowRepository(db, access.workspace_id).save(flow)
    except FlowIdentifierConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

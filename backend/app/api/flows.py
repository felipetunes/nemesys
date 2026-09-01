from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.auth import require_management_access
from app.core.db import get_db
from app.models import FlowDefinition
from app.services.flow_repository import FlowRepository
from app.services.flow_validator import FlowValidationResult, validate_flow

router = APIRouter(prefix="/api/flows", tags=["flows"])


@router.get("", response_model=list[FlowDefinition])
def list_flows(db: Session = Depends(get_db)) -> list[FlowDefinition]:
    return FlowRepository(db).list_drafts()


@router.get("/{flow_id}", response_model=FlowDefinition)
def get_flow(flow_id: str, db: Session = Depends(get_db)) -> FlowDefinition:
    flow = FlowRepository(db).get(flow_id)
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    return flow


@router.post("/actions/validate", response_model=FlowValidationResult)
def validate_flow_definition(flow: FlowDefinition) -> FlowValidationResult:
    return validate_flow(flow)


@router.post("/actions/import", response_model=FlowDefinition, status_code=201)
def import_flow_definition(
    flow: FlowDefinition,
    overwrite: bool = Query(default=False),
    _: None = Depends(require_management_access),
    db: Session = Depends(get_db),
) -> FlowDefinition:
    repo = FlowRepository(db)
    if repo.get(flow.id) is not None and not overwrite:
        raise HTTPException(status_code=409, detail="Flow already exists; set overwrite=true to replace its draft")
    validation = validate_flow(flow)
    if not validation.valid:
        raise HTTPException(
            status_code=422,
            detail={"message": "Flow validation failed", "errors": [issue.model_dump() for issue in validation.errors]},
        )
    return repo.save(flow)


@router.get("/{flow_id}/export")
def export_flow_definition(flow_id: str, db: Session = Depends(get_db)) -> JSONResponse:
    flow = FlowRepository(db).get(flow_id)
    if flow is None:
        raise HTTPException(status_code=404, detail="Flow not found")
    portable = flow.model_copy(update={"version": None, "published_at": None, "updated_at": None})
    return JSONResponse(
        content=jsonable_encoder(portable, exclude_none=True),
        headers={"Content-Disposition": f'attachment; filename="{flow.id}.flow.json"'},
    )


@router.get("/{flow_id}/versions", response_model=list[FlowDefinition])
def list_flow_versions(flow_id: str, db: Session = Depends(get_db)) -> list[FlowDefinition]:
    repo = FlowRepository(db)
    if repo.get(flow_id) is None:
        raise HTTPException(status_code=404, detail="Flow not found")
    return repo.list_versions(flow_id)


@router.get("/{flow_id}/versions/{version}", response_model=FlowDefinition)
def get_flow_version(flow_id: str, version: int, db: Session = Depends(get_db)) -> FlowDefinition:
    flow = FlowRepository(db).get_version(flow_id, version)
    if flow is None:
        raise HTTPException(status_code=404, detail="Flow version not found")
    return flow


@router.post("/{flow_id}/publish", response_model=FlowDefinition)
def publish_flow(
    flow_id: str,
    _: None = Depends(require_management_access),
    db: Session = Depends(get_db),
) -> FlowDefinition:
    repo = FlowRepository(db)
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
    _: None = Depends(require_management_access),
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
    return FlowRepository(db).save(flow)

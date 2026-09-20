from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.interviewer_registry import interviewer_registry

router = APIRouter(prefix="/interviewer-versions", tags=["interviewer-versions"])


class CreateInterviewerVersionRequest(BaseModel):
    interviewer_id: str = Field(min_length=1, max_length=64)
    display_name: str = Field(min_length=1, max_length=128)
    spec: Dict[str, Any] = Field(default_factory=dict)
    prompt_template_version: str = "legacy-v1"
    rubric_id: Optional[str] = None
    created_by: str = "admin"


@router.get("")
async def list_interviewer_versions(interviewer_id: Optional[str] = None):
    return {"versions": await interviewer_registry.list_versions(interviewer_id)}


@router.post("")
async def create_interviewer_version(req: CreateInterviewerVersionRequest):
    return await interviewer_registry.create_version(
        req.interviewer_id,
        req.display_name,
        req.spec,
        prompt_template_version=req.prompt_template_version,
        rubric_id=req.rubric_id,
        created_by=req.created_by,
    )


@router.post("/{version_id}/approve")
async def approve_interviewer_version(version_id: str):
    try:
        return await interviewer_registry.approve(version_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/{version_id}/rollback")
async def rollback_interviewer_version(version_id: str):
    try:
        return await interviewer_registry.rollback(version_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

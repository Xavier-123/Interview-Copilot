"""Version registry for immutable interviewer specifications."""

import uuid
from typing import Any, Dict, Optional

from sqlalchemy import desc, select

from app.models.architecture import InterviewerSpecModel, InterviewerVersionModel
from app.models.db import AsyncSessionLocal


class InterviewerVersionRegistry:
    async def create_version(
        self,
        interviewer_id: str,
        display_name: str,
        spec: Dict[str, Any],
        *,
        prompt_template_version: str = "legacy-v1",
        rubric_id: Optional[str] = None,
        created_by: str = "admin",
    ) -> Dict[str, Any]:
        async with AsyncSessionLocal() as db:
            current = await db.execute(
                select(InterviewerVersionModel)
                .where(InterviewerVersionModel.interviewer_id == interviewer_id)
                .order_by(desc(InterviewerVersionModel.created_at))
            )
            count = len(current.scalars().all())
            version = f"v{count + 1}"
            version_id = str(uuid.uuid4())
            db.add(InterviewerVersionModel(
                id=version_id,
                interviewer_id=interviewer_id,
                version=version,
                status="review_required",
                spec=spec,
                prompt_template_version=prompt_template_version,
                rubric_id=rubric_id,
                created_by=created_by,
            ))
            spec_row = await db.execute(
                select(InterviewerSpecModel).where(
                    InterviewerSpecModel.interviewer_id == interviewer_id
                )
            )
            parent = spec_row.scalars().first()
            if parent:
                parent.display_name = display_name
                parent.spec = spec
            else:
                db.add(InterviewerSpecModel(
                    id=str(uuid.uuid4()),
                    interviewer_id=interviewer_id,
                    display_name=display_name,
                    spec=spec,
                ))
            await db.commit()
            from app.services.audit import log_audit_event
            await log_audit_event(
                event_type="interviewer_version_created",
                actor=created_by,
                target_id=version_id,
                payload={"interviewer_id": interviewer_id, "version": version, "status": "review_required"}
            )
            return {"id": version_id, "interviewer_id": interviewer_id, "version": version, "status": "review_required"}

    async def get_version(self, version_id: str) -> Optional[Dict[str, Any]]:
        async with AsyncSessionLocal() as db:
            item = await db.get(InterviewerVersionModel, version_id)
            if not item:
                return None
            return self._serialize(item)

    async def list_versions(self, interviewer_id: Optional[str] = None) -> list[Dict[str, Any]]:
        async with AsyncSessionLocal() as db:
            query = select(InterviewerVersionModel).order_by(desc(InterviewerVersionModel.created_at))
            if interviewer_id:
                query = query.where(InterviewerVersionModel.interviewer_id == interviewer_id)
            result = await db.execute(query)
            return [self._serialize(item) for item in result.scalars().all()]

    async def approve(self, version_id: str, actor: str = "admin") -> Dict[str, Any]:
        async with AsyncSessionLocal() as db:
            version = await db.get(InterviewerVersionModel, version_id)
            if not version:
                raise ValueError("Interviewer version not found")
            if version.status not in {"review_required", "canary"}:
                raise ValueError(f"Version status is {version.status}")
            version.status = "champion"
            parent_result = await db.execute(
                select(InterviewerSpecModel).where(
                    InterviewerSpecModel.interviewer_id == version.interviewer_id
                )
            )
            parent = parent_result.scalars().first()
            if parent:
                parent.active_version_id = version.id
                parent.spec = version.spec
            await db.commit()
            from app.services.audit import log_audit_event
            await log_audit_event(
                event_type="interviewer_version_approved",
                actor=actor,
                target_id=version_id,
                payload={"interviewer_id": version.interviewer_id, "version": version.version, "status": "champion"}
            )
            return self._serialize(version)

    async def rollback(self, version_id: str, actor: str = "admin") -> Dict[str, Any]:
        async with AsyncSessionLocal() as db:
            target = await db.get(InterviewerVersionModel, version_id)
            if not target:
                raise ValueError("Interviewer version not found")
            result = await db.execute(
                select(InterviewerVersionModel).where(
                    InterviewerVersionModel.interviewer_id == target.interviewer_id,
                    InterviewerVersionModel.status == "champion",
                )
            )
            for item in result.scalars().all():
                item.status = "retired"
            target.status = "champion"
            parent_result = await db.execute(
                select(InterviewerSpecModel).where(
                    InterviewerSpecModel.interviewer_id == target.interviewer_id
                )
            )
            parent = parent_result.scalars().first()
            if parent:
                parent.active_version_id = target.id
                parent.spec = target.spec
            await db.commit()
            from app.services.audit import log_audit_event
            await log_audit_event(
                event_type="interviewer_version_rolled_back",
                actor=actor,
                target_id=version_id,
                payload={"interviewer_id": target.interviewer_id, "version": target.version, "status": "champion"}
            )
            return self._serialize(target)

    @staticmethod
    def _serialize(item: InterviewerVersionModel) -> Dict[str, Any]:
        return {
            "id": item.id,
            "interviewer_id": item.interviewer_id,
            "display_name": (item.spec or {}).get("display_name") or item.interviewer_id,
            "version": item.version,
            "status": item.status,
            "spec": item.spec or {},
            "prompt_template_version": item.prompt_template_version,
            "rubric_id": item.rubric_id,
            "metrics": item.metrics or {},
            "created_by": item.created_by,
            "created_at": item.created_at.isoformat() if item.created_at else None,
        }


interviewer_registry = InterviewerVersionRegistry()

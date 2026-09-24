import os
import re
import uuid
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.parser import parser_service
from app.services.resume_polish import resume_polish_service
from app.agents.llm import LLMError
from app.models.db import get_db
from app.models.resume import SavedResume
from app.core.config import settings

router = APIRouter(prefix="/profiles", tags=["profiles"])

class ParseResumeRequest(BaseModel):
    resume_text: str = Field(max_length=settings.MAX_TEXT_BYTES)

class ParseJDRequest(BaseModel):
    jd_text: str = Field(max_length=settings.MAX_TEXT_BYTES)

class ResumeUpdateRequest(BaseModel):
    filename: Optional[str] = None
    raw_text: Optional[str] = Field(default=None, max_length=settings.MAX_TEXT_BYTES)
    parsed_profile: Optional[Dict[str, Any]] = None
    reparse: bool = False

class ResumePolishRequest(BaseModel):
    """简历 AI 体检入参：JD 与目标岗位均可选（无 JD 时聚焦表达质量与追问风险）。"""
    jd_text: Optional[str] = Field(default=None, max_length=settings.MAX_TEXT_BYTES)
    target_role: Optional[str] = Field(default=None, max_length=128)

class ResumePolishApplyItem(BaseModel):
    quote: str = Field(min_length=1, max_length=4000)
    rewritten: str = Field(min_length=1, max_length=4000)

class ResumePolishApplyRequest(BaseModel):
    """采纳打磨建议生成新简历副本（不覆盖原件）。"""
    items: List[ResumePolishApplyItem]
    target_role: Optional[str] = Field(default=None, max_length=128)


def _resume_detail_response(resume: SavedResume) -> Dict[str, Any]:
    return {
        "id": resume.id,
        "filename": resume.filename,
        "created_at": resume.created_at.isoformat() if resume.created_at else None,
        "updated_at": resume.updated_at.isoformat() if resume.updated_at else None,
        "parsed_profile": resume.parsed_profile,
        "raw_text": resume.raw_text,
        "source_resume_id": resume.source_resume_id,
    }


def _polished_filename(original: str, target_role: Optional[str]) -> str:
    """生成优化版副本文件名：原名-{目标岗位|AI优化版}，保留原扩展名。"""
    stem, ext = os.path.splitext(original.strip())
    label = (target_role or "").strip()
    label = re.sub(r'[\\/:*?"<>|\r\n]+', "-", label) or "AI优化版"
    if not stem:
        stem = "简历"
    return f"{stem[:200]}-{label}{ext}"

@router.post("/parse-resume")
async def parse_resume_endpoint(req: ParseResumeRequest):
    """Analyze and structure resume text into candidate profile."""
    try:
        profile = await parser_service.parse_resume(req.resume_text)
        return {"status": "success", "profile": profile}
    except LLMError:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="服务暂时不可用")

@router.post("/parse-jd")
async def parse_jd_endpoint(req: ParseJDRequest):
    """Analyze and extract key requirements from Job Description."""
    try:
        requirements = await parser_service.parse_jd(req.jd_text)
        return {"status": "success", "requirements": requirements}
    except LLMError:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="服务暂时不可用")

@router.post("/upload-resume")
async def upload_resume_file(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """Upload resume file (PDF, DOCX, TXT, MD), extract text, and return structured profile."""
    try:
        filename = os.path.basename(file.filename or "resume.txt")
        extension = os.path.splitext(filename)[1].lower()
        if extension not in {".pdf", ".docx", ".txt", ".md", ".json"}:
            raise HTTPException(status_code=400, detail="仅支持 PDF、DOCX、TXT、MD 或 JSON 简历文件")
        contents = await file.read()
        if len(contents) > settings.MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="上传文件不能超过 10MB")
        extracted_text = parser_service.extract_text_from_file(contents, filename)
        if not extracted_text.strip():
            raise HTTPException(status_code=400, detail="未能从上传的文件中提取到有效文本，请确认文件是否损坏或为空。")

        parsed_profile = await parser_service.parse_resume(extracted_text)

        os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
        saved_path = os.path.join(settings.UPLOAD_DIR, f"{uuid.uuid4().hex}_{filename}")
        try:
            with open(saved_path, "wb") as f:
                f.write(contents)
        except Exception:
            saved_path = None

        saved_resume = SavedResume(
            id=str(uuid.uuid4()),
            filename=filename,
            file_path=saved_path,
            raw_text=extracted_text,
            parsed_profile=parsed_profile
        )
        db.add(saved_resume)
        await db.commit()
        saved_resume_id = saved_resume.id

        return {
            "status": "success",
            "filename": filename,
            "raw_text": extracted_text,
            "profile": parsed_profile,
            "resume_id": saved_resume_id
        }
    except HTTPException:
        raise
    except LLMError:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="文件处理失败，请稍后重试")

@router.post("/resumes/{resume_id}/polish")
async def polish_resume(
    resume_id: str,
    payload: ResumePolishRequest,
    db: AsyncSession = Depends(get_db)
):
    """AI 体检：对简历做诊断分析（匹配缺口/逐条改写建议/追问风险），不修改简历本身。"""
    resume = await db.get(SavedResume, resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="简历不存在或已被删除")
    try:
        report = await resume_polish_service.diagnose(
            resume.raw_text,
            jd_text=payload.jd_text,
            target_role=payload.target_role,
        )
    except LLMError:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="AI 分析暂时不可用，请稍后重试")
    return {"status": "success", "report": report}


@router.post("/resumes/{resume_id}/polish/apply")
async def apply_resume_polish(
    resume_id: str,
    payload: ResumePolishApplyRequest,
    db: AsyncSession = Depends(get_db)
):
    """把采纳的改写建议应用到原文，生成一份新的优化版简历副本（原件不动）。"""
    resume = await db.get(SavedResume, resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="简历不存在或已被删除")
    if not payload.items:
        raise HTTPException(status_code=400, detail="请至少选择一条要采纳的建议")

    new_text, applied, skipped = resume_polish_service.apply_suggestions(
        resume.raw_text, [item.model_dump() for item in payload.items]
    )
    if not applied:
        raise HTTPException(status_code=400, detail="选中的建议均未能定位到简历原文，无法应用")

    new_resume = SavedResume(
        id=str(uuid.uuid4()),
        filename=_polished_filename(resume.filename, payload.target_role),
        raw_text=new_text,
        # 以优化后的原文重新生成画像（模型不可用时会抛错，不会写入示例画像）
        parsed_profile=await parser_service.parse_resume(new_text),
        source_resume_id=resume.id,
    )
    db.add(new_resume)
    await db.commit()
    await db.refresh(new_resume)
    return {
        "status": "success",
        "message": "优化版简历已生成",
        "applied": applied,
        "skipped": skipped,
        "resume": _resume_detail_response(new_resume),
    }


@router.get("/resumes/{resume_id}")
async def get_saved_resume_detail(
    resume_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get full content of a saved resume (list endpoint only returns a preview)."""
    resume = await db.get(SavedResume, resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="简历不存在或已被删除")
    return _resume_detail_response(resume)


@router.put("/resumes/{resume_id}")
async def update_saved_resume(
    resume_id: str,
    payload: ResumeUpdateRequest,
    db: AsyncSession = Depends(get_db)
):
    """Update a saved resume's filename, raw text and/or parsed profile."""
    resume = await db.get(SavedResume, resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="简历不存在或已被删除")

    if payload.filename is not None:
        filename = payload.filename.strip()
        if not filename:
            raise HTTPException(status_code=400, detail="简历文件名不能为空")
        resume.filename = filename

    if payload.raw_text is not None:
        raw_text = payload.raw_text.strip()
        if not raw_text:
            raise HTTPException(status_code=400, detail="简历原文内容不能为空")
        resume.raw_text = raw_text

    if payload.reparse:
        # 用最新原文重新 AI 解析并覆盖画像；模型不可用时抛错，由全局处理器返回可读原因
        resume.parsed_profile = await parser_service.parse_resume(resume.raw_text)
    elif payload.parsed_profile is not None:
        resume.parsed_profile = payload.parsed_profile

    await db.commit()
    await db.refresh(resume)
    return _resume_detail_response(resume)

@router.get("/resumes")
async def get_saved_resumes(
    db: AsyncSession = Depends(get_db)
):
    """Get list of all saved resumes (local single-user mode)."""
    result = await db.execute(
        select(SavedResume).order_by(SavedResume.created_at.desc())
    )
    resumes = result.scalars().all()
    return {
        "resumes": [
            {
                "id": r.id,
                "filename": r.filename,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
                "parsed_profile": r.parsed_profile,
                "source_resume_id": r.source_resume_id,
                "raw_text_preview": r.raw_text[:200] + "..." if len(r.raw_text) > 200 else r.raw_text
            }
            for r in resumes
        ]
    }


@router.delete("/resumes/{resume_id}")
async def delete_saved_resume(
    resume_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Delete a saved resume and remove physical file if it exists."""
    resume = await db.get(SavedResume, resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="简历不存在或已被删除")

    if resume.file_path and os.path.exists(resume.file_path):
        try:
            os.remove(resume.file_path)
        except Exception:
            pass

    await db.delete(resume)
    await db.commit()
    return {"status": "success", "message": "简历已成功删除", "resume_id": resume_id}


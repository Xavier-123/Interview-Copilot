import os
import uuid
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.parser import parser_service
from app.models.db import get_db
from app.models.resume import SavedResume
from app.core.config import settings

router = APIRouter(prefix="/profiles", tags=["profiles"])

class ParseResumeRequest(BaseModel):
    resume_text: str

class ParseJDRequest(BaseModel):
    jd_text: str

@router.post("/parse-resume")
async def parse_resume_endpoint(req: ParseResumeRequest):
    """Analyze and structure resume text into candidate profile."""
    try:
        profile = await parser_service.parse_resume(req.resume_text)
        return {"status": "success", "profile": profile}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/parse-jd")
async def parse_jd_endpoint(req: ParseJDRequest):
    """Analyze and extract key requirements from Job Description."""
    try:
        requirements = await parser_service.parse_jd(req.jd_text)
        return {"status": "success", "requirements": requirements}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload-resume")
async def upload_resume_file(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """Upload resume file (PDF, DOCX, TXT, MD), extract text, and return structured profile."""
    try:
        contents = await file.read()
        extracted_text = parser_service.extract_text_from_file(contents, file.filename or "resume.txt")
        if not extracted_text.strip():
            raise HTTPException(status_code=400, detail="未能从上传的文件中提取到有效文本，请确认文件是否损坏或为空。")

        parsed_profile = await parser_service.parse_resume(extracted_text)

        os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
        saved_path = os.path.join(settings.UPLOAD_DIR, f"{uuid.uuid4().hex}_{file.filename}")
        try:
            with open(saved_path, "wb") as f:
                f.write(contents)
        except Exception:
            saved_path = None

        saved_resume = SavedResume(
            id=str(uuid.uuid4()),
            filename=file.filename or "resume",
            file_path=saved_path,
            raw_text=extracted_text,
            parsed_profile=parsed_profile
        )
        db.add(saved_resume)
        await db.commit()
        saved_resume_id = saved_resume.id

        return {
            "status": "success",
            "filename": file.filename,
            "raw_text": extracted_text,
            "profile": parsed_profile,
            "resume_id": saved_resume_id
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"文件处理失败: {str(e)}")

@router.get("/resumes/{resume_id}")
async def get_saved_resume_detail(
    resume_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get full content of a saved resume (list endpoint only returns a preview)."""
    resume = await db.get(SavedResume, resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="简历不存在或已被删除")
    return {
        "id": resume.id,
        "filename": resume.filename,
        "created_at": resume.created_at.isoformat() if resume.created_at else None,
        "parsed_profile": resume.parsed_profile,
        "raw_text": resume.raw_text,
    }

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
                "parsed_profile": r.parsed_profile,
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


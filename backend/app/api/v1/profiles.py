from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.services.parser import parser_service

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

import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.db import get_db
from app.models.user import User, UserProfile
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user_required,
    get_current_user_optional,
)

router = APIRouter(prefix="/auth", tags=["auth"])

class RegisterRequest(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    real_name: Optional[str] = "候选人"
    target_role: Optional[str] = "资深后端架构师"
    target_industry: Optional[str] = "互联网/电商"
    target_level: Optional[str] = "senior"
    experience_years: Optional[int] = 3
    skills: Optional[List[str]] = None

class LoginRequest(BaseModel):
    username: str  # Can be username or email
    password: str

class UpdateProfileRequest(BaseModel):
    real_name: Optional[str] = None
    target_role: Optional[str] = None
    target_industry: Optional[str] = None
    target_level: Optional[str] = None
    experience_years: Optional[int] = None
    skills: Optional[List[str]] = None
    bio: Optional[str] = None

@router.post("/register")
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """User registration with initial profile creation."""
    # Check if username exists
    existing = await db.execute(
        select(User).where(or_(User.username == req.username, User.email == req.email if req.email else False))
    )
    if existing.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名或邮箱已被注册"
        )

    user = User(
        id=str(uuid.uuid4()),
        username=req.username,
        email=req.email,
        hashed_password=hash_password(req.password),
        is_guest=False
    )
    db.add(user)
    await db.flush()

    profile = UserProfile(
        id=str(uuid.uuid4()),
        user_id=user.id,
        real_name=req.real_name or req.username,
        target_role=req.target_role or "资深研发",
        target_industry=req.target_industry or "互联网/电商",
        target_level=req.target_level or "senior",
        experience_years=req.experience_years or 3,
        skills=req.skills or ["Python", "微服务", "高可用架构"],
        bio=""
    )
    db.add(profile)
    await db.commit()
    await db.refresh(user)

    token = create_access_token({"sub": user.id, "username": user.username})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "is_guest": False,
            "profile": {
                "real_name": profile.real_name,
                "target_role": profile.target_role,
                "target_industry": profile.target_industry,
                "target_level": profile.target_level,
                "experience_years": profile.experience_years,
                "skills": profile.skills,
                "bio": profile.bio
            }
        }
    }

@router.post("/login")
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    """User login."""
    result = await db.execute(
        select(User).where(or_(User.username == req.username, User.email == req.username))
    )
    user = result.scalars().first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码不正确"
        )

    # Get profile
    profile_result = await db.execute(select(UserProfile).where(UserProfile.user_id == user.id))
    profile = profile_result.scalars().first()

    token = create_access_token({"sub": user.id, "username": user.username})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "is_guest": user.is_guest,
            "profile": {
                "real_name": profile.real_name if profile else user.username,
                "target_role": profile.target_role if profile else "研发工程师",
                "target_industry": profile.target_industry if profile else "互联网/电商",
                "target_level": profile.target_level if profile else "senior",
                "experience_years": profile.experience_years if profile else 3,
                "skills": profile.skills if profile else [],
                "bio": profile.bio if profile else ""
            } if profile else None
        }
    }

@router.post("/guest")
async def guest_login(db: AsyncSession = Depends(get_db)):
    """Quick guest login for immediate experience without credentials."""
    guest_username = f"guest_{uuid.uuid4().hex[:8]}"
    guest_user = User(
        id=str(uuid.uuid4()),
        username=guest_username,
        email=f"{guest_username}@example.com",
        hashed_password=hash_password("guest_pass"),
        is_guest=True
    )
    db.add(guest_user)
    await db.flush()

    guest_profile = UserProfile(
        id=str(uuid.uuid4()),
        user_id=guest_user.id,
        real_name="体验候选人",
        target_role="资深后端架构师",
        target_industry="互联网/电商",
        target_level="senior",
        experience_years=4,
        skills=["Python", "FastAPI", "Redis", "高并发架构"],
        bio="面试模拟体验账号"
    )
    db.add(guest_profile)
    await db.commit()

    token = create_access_token({"sub": guest_user.id, "username": guest_user.username})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": guest_user.id,
            "username": guest_user.username,
            "is_guest": True,
            "profile": {
                "real_name": guest_profile.real_name,
                "target_role": guest_profile.target_role,
                "target_industry": guest_profile.target_industry,
                "target_level": guest_profile.target_level,
                "experience_years": guest_profile.experience_years,
                "skills": guest_profile.skills,
                "bio": guest_profile.bio
            }
        }
    }

@router.get("/me")
async def get_me(user: User = Depends(get_current_user_required), db: AsyncSession = Depends(get_db)):
    """Get current user and profile."""
    profile_result = await db.execute(select(UserProfile).where(UserProfile.user_id == user.id))
    profile = profile_result.scalars().first()
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "is_guest": user.is_guest,
        "profile": {
            "real_name": profile.real_name if profile else user.username,
            "target_role": profile.target_role if profile else "研发工程师",
            "target_industry": profile.target_industry if profile else "互联网/电商",
            "target_level": profile.target_level if profile else "senior",
            "experience_years": profile.experience_years if profile else 3,
            "skills": profile.skills if profile else [],
            "bio": profile.bio if profile else ""
        } if profile else None
    }

@router.put("/profile")
async def update_profile(
    req: UpdateProfileRequest,
    user: User = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db)
):
    """Update current user's profile."""
    profile_result = await db.execute(select(UserProfile).where(UserProfile.user_id == user.id))
    profile = profile_result.scalars().first()

    if not profile:
        profile = UserProfile(id=str(uuid.uuid4()), user_id=user.id)
        db.add(profile)

    if req.real_name is not None:
        profile.real_name = req.real_name
    if req.target_role is not None:
        profile.target_role = req.target_role
    if req.target_industry is not None:
        profile.target_industry = req.target_industry
    if req.target_level is not None:
        profile.target_level = req.target_level
    if req.experience_years is not None:
        profile.experience_years = req.experience_years
    if req.skills is not None:
        profile.skills = req.skills
    if req.bio is not None:
        profile.bio = req.bio

    await db.commit()
    await db.refresh(profile)

    return {
        "status": "success",
        "profile": {
            "real_name": profile.real_name,
            "target_role": profile.target_role,
            "target_industry": profile.target_industry,
            "target_level": profile.target_level,
            "experience_years": profile.experience_years,
            "skills": profile.skills,
            "bio": profile.bio
        }
    }

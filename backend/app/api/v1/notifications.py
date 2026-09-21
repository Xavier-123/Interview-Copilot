from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.db import get_db
from app.models.notification import NotificationSetting
from app.services.email_service import (
    send_smtp_email,
    render_test_email_html,
)
from app.services.reminder_worker import check_and_send_due_reminders

router = APIRouter(prefix="/notifications", tags=["notifications"])


class NotificationSettingsPayload(BaseModel):
    email_enabled: bool = False
    receiver_email: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: int = Field(default=465, ge=1, le=65535)
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_use_ssl: bool = True
    smtp_from_name: str = "Interview-Copilot"
    remind_advance_hours: int = Field(default=2, ge=1, le=72)


class TestEmailPayload(BaseModel):
    receiver_email: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_use_ssl: Optional[bool] = None
    smtp_from_name: Optional[str] = None


def _mask_password(pwd: Optional[str]) -> str:
    return "******" if pwd else ""


def _setting_to_dict(s: Optional[NotificationSetting]) -> dict:
    if not s:
        return {
            "email_enabled": False,
            "receiver_email": "",
            "smtp_host": "",
            "smtp_port": 465,
            "smtp_user": "",
            "smtp_password": "",
            "smtp_use_ssl": True,
            "smtp_from_name": "Interview-Copilot",
            "remind_advance_hours": 2,
            "has_password": False,
        }
    return {
        "email_enabled": s.email_enabled,
        "receiver_email": s.receiver_email or "",
        "smtp_host": s.smtp_host or "",
        "smtp_port": s.smtp_port or 465,
        "smtp_user": s.smtp_user or "",
        "smtp_password": _mask_password(s.smtp_password),
        "smtp_use_ssl": s.smtp_use_ssl,
        "smtp_from_name": s.smtp_from_name or "Interview-Copilot",
        "remind_advance_hours": s.remind_advance_hours or 2,
        "has_password": bool(s.smtp_password),
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }


@router.get("/settings")
async def get_settings(db: AsyncSession = Depends(get_db)):
    """获取当前的邮件通知配置。"""
    res = await db.execute(
        select(NotificationSetting).where(NotificationSetting.id == "default")
    )
    setting = res.scalar_one_or_none()
    return {"settings": _setting_to_dict(setting)}


@router.post("/settings")
async def update_settings(
    payload: NotificationSettingsPayload,
    db: AsyncSession = Depends(get_db)
):
    """保存或更新邮件通知配置。"""
    res = await db.execute(
        select(NotificationSetting).where(NotificationSetting.id == "default")
    )
    setting = res.scalar_one_or_none()

    if not setting:
        setting = NotificationSetting(id="default")
        db.add(setting)

    setting.email_enabled = payload.email_enabled
    setting.receiver_email = payload.receiver_email.strip() if payload.receiver_email else None
    setting.smtp_host = payload.smtp_host.strip() if payload.smtp_host else None
    setting.smtp_port = payload.smtp_port
    setting.smtp_user = payload.smtp_user.strip() if payload.smtp_user else None

    # 如果传入的不是掩码 '******'，则更新密码；若是掩码或空字符串且已有密码，则保留原密码
    if payload.smtp_password and payload.smtp_password != "******":
        setting.smtp_password = payload.smtp_password.strip()
    elif payload.smtp_password == "" and setting.smtp_password:
        # 显式清空密码
        setting.smtp_password = None

    setting.smtp_use_ssl = payload.smtp_use_ssl
    setting.smtp_from_name = payload.smtp_from_name.strip() if payload.smtp_from_name else "Interview-Copilot"
    setting.remind_advance_hours = payload.remind_advance_hours
    setting.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(setting)

    return {
        "status": "success",
        "message": "通知设置保存成功",
        "settings": _setting_to_dict(setting),
    }


@router.post("/test-email")
async def test_email(
    payload: TestEmailPayload,
    db: AsyncSession = Depends(get_db)
):
    """发送连通性测试邮件。支持根据传入参数测试或读取库中已有配置测试。"""
    res = await db.execute(
        select(NotificationSetting).where(NotificationSetting.id == "default")
    )
    saved = res.scalar_one_or_none()

    # 优先取 payload，没有则取已保存的配置
    receiver_email = (payload.receiver_email or (saved.receiver_email if saved else "") or "").strip()
    host = (payload.smtp_host or (saved.smtp_host if saved else "") or "").strip()
    port = payload.smtp_port or (saved.smtp_port if saved else 465)
    user = (payload.smtp_user or (saved.smtp_user if saved else "") or "").strip()

    # 处理密码
    if payload.smtp_password and payload.smtp_password != "******":
        password = payload.smtp_password.strip()
    elif saved and saved.smtp_password:
        password = saved.smtp_password
    else:
        password = ""

    use_ssl = payload.smtp_use_ssl if payload.smtp_use_ssl is not None else (saved.smtp_use_ssl if saved else True)
    from_name = (payload.smtp_from_name or (saved.smtp_from_name if saved else "Interview-Copilot") or "Interview-Copilot").strip()

    if not receiver_email:
        raise HTTPException(status_code=400, detail="请填写接收测试邮件的目标邮箱地址")
    if not host or not user or not password:
        raise HTTPException(status_code=400, detail="SMTP 服务器地址、发信账号或密码/授权码未完整填写")

    subject = "【Interview-Copilot】SMTP 邮件通知服务连通性测试"
    html_content = render_test_email_html(receiver_email)

    try:
        await send_smtp_email(
            host=host,
            port=port,
            user=user,
            password=password,
            use_ssl=use_ssl,
            from_name=from_name,
            to_email=receiver_email,
            subject=subject,
            html_content=html_content,
        )
        return {
            "status": "success",
            "message": f"测试邮件已成功发送至 {receiver_email}，请查收邮箱确认！",
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"发送测试邮件失败: {str(e)}")


@router.post("/trigger-check")
async def trigger_check(db: AsyncSession = Depends(get_db)):
    """手动立即触发一次临近待面试日程检测并尝试发送邮件。"""
    result = await check_and_send_due_reminders(db)
    return result

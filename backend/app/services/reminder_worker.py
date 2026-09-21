import asyncio
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List
import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.db import AsyncSessionLocal
from app.models.schedule import InterviewSchedule
from app.models.notification import NotificationSetting
from app.services.email_service import (
    send_smtp_email,
    render_reminder_html,
    _format_time_str,
)

logger = logging.getLogger(__name__)


async def check_and_send_due_reminders(db: AsyncSession) -> Dict[str, Any]:
    """检查即将到来的待面试日程，并在达到设定阈值且未发送时推送提醒邮件。"""
    res = await db.execute(
        select(NotificationSetting).where(NotificationSetting.id == "default")
    )
    setting = res.scalar_one_or_none()

    if (
        not setting
        or not setting.email_enabled
        or not setting.receiver_email
        or not setting.smtp_host
        or not setting.smtp_user
        or not setting.smtp_password
    ):
        return {
            "checked": 0,
            "sent": 0,
            "status": "disabled_or_unconfigured",
            "message": "邮件提醒未开启或 SMTP 配置未完善",
        }

    now_utc = datetime.utcnow()
    advance_hours = max(1, setting.remind_advance_hours or 2)
    threshold_time = now_utc + timedelta(hours=advance_hours)

    # 查出当前时间后、且在阈值范围内的 upcoming 日程，且 email_reminded_at 为空
    query = (
        select(InterviewSchedule)
        .where(
            InterviewSchedule.status == "upcoming",
            InterviewSchedule.scheduled_at >= (now_utc - timedelta(minutes=10)),  # 容差：10分钟内刚过去的也不漏掉
            InterviewSchedule.scheduled_at <= threshold_time,
            InterviewSchedule.email_reminded_at.is_(None),
        )
        .order_by(InterviewSchedule.scheduled_at.asc())
    )

    result = await db.execute(query)
    schedules: List[InterviewSchedule] = result.scalars().all()

    sent_count = 0
    errors = []

    for s in schedules:
        try:
            # 计算剩余时间
            diff_seconds = (s.scheduled_at - now_utc).total_seconds()
            diff_hours = int(diff_seconds // 3600)
            diff_mins = int((diff_seconds % 3600) // 60)

            if diff_hours > 0:
                time_desc = f"约 {diff_hours} 小时 {diff_mins} 分钟后"
            elif diff_mins > 0:
                time_desc = f"约 {diff_mins} 分钟后"
            else:
                time_desc = "即将开始"

            time_str = _format_time_str(s.scheduled_at)

            html_body = render_reminder_html(
                company=s.company,
                job_role=s.job_role,
                interview_round=s.interview_round,
                scheduled_at_str=time_str,
                location_type=s.location_type,
                meeting_link_or_address=s.meeting_link_or_address,
                salary=s.salary,
                notes=s.notes,
                jd_text=s.jd_text,
                advance_notice=time_desc,
            )

            subject = f"【面试临近提醒】{s.company} · {s.job_role}（{s.interview_round}）{time_desc}"

            await send_smtp_email(
                host=setting.smtp_host,
                port=setting.smtp_port,
                user=setting.smtp_user,
                password=setting.smtp_password,
                use_ssl=setting.smtp_use_ssl,
                from_name=setting.smtp_from_name or "Interview-Copilot",
                to_email=setting.receiver_email,
                subject=subject,
                html_content=html_body,
            )

            # 标记已发送时间并落库
            s.email_reminded_at = datetime.utcnow()
            await db.commit()
            sent_count += 1
            logger.info(f"Successfully sent interview reminder email for schedule {s.id} ({s.company})")

        except Exception as e:
            logger.error(f"Failed to send reminder email for schedule {s.id}: {e}", exc_info=True)
            errors.append({"schedule_id": s.id, "error": str(e)})

    return {
        "checked": len(schedules),
        "sent": sent_count,
        "errors": errors,
        "status": "success",
    }


async def reminder_scheduler_loop(interval_seconds: int = 60):
    """后台常驻定时检测协程。"""
    logger.info(f"Starting interview reminder background worker (polling every {interval_seconds}s)")
    while True:
        try:
            async with AsyncSessionLocal() as session:
                await check_and_send_due_reminders(session)
        except asyncio.CancelledError:
            logger.info("Interview reminder worker cancelled. Shutting down gracefully.")
            break
        except Exception as e:
            logger.error(f"Error in reminder_scheduler_loop: {e}", exc_info=True)

        try:
            await asyncio.sleep(interval_seconds)
        except asyncio.CancelledError:
            break

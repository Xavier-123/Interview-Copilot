import pytest
from datetime import datetime, timedelta
from unittest.mock import patch
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.db import init_db, AsyncSessionLocal
from app.models.schedule import InterviewSchedule
from app.models.notification import NotificationSetting


@pytest.mark.asyncio
async def test_notifications_settings_flow():
    await init_db()
    async with AsyncSessionLocal() as session:
        setting = await session.get(NotificationSetting, "default")
        if setting:
            await session.delete(setting)
            await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Get default settings
        res = await client.get("/api/v1/notifications/settings")
        assert res.status_code == 200
        data = res.json()["settings"]
        assert data["email_enabled"] is False

        # 2. Update settings
        save_res = await client.post("/api/v1/notifications/settings", json={
            "email_enabled": True,
            "receiver_email": "candidate@example.com",
            "smtp_host": "smtp.example.com",
            "smtp_port": 465,
            "smtp_user": "robot@example.com",
            "smtp_password": "super_secret_auth_code",
            "smtp_use_ssl": True,
            "smtp_from_name": "Interview-Copilot",
            "remind_advance_hours": 2,
        })
        assert save_res.status_code == 200
        saved_data = save_res.json()["settings"]
        assert saved_data["email_enabled"] is True
        assert saved_data["receiver_email"] == "candidate@example.com"
        assert saved_data["smtp_password"] == "******"  # Masked!
        assert saved_data["has_password"] is True

        # 3. Update without changing password (send '******')
        update_res = await client.post("/api/v1/notifications/settings", json={
            "email_enabled": True,
            "receiver_email": "new_receiver@example.com",
            "smtp_host": "smtp.example.com",
            "smtp_port": 465,
            "smtp_user": "robot@example.com",
            "smtp_password": "******",  # Preserve
            "smtp_use_ssl": True,
            "smtp_from_name": "Interview-Copilot",
            "remind_advance_hours": 4,
        })
        assert update_res.status_code == 200
        assert update_res.json()["settings"]["receiver_email"] == "new_receiver@example.com"
        assert update_res.json()["settings"]["remind_advance_hours"] == 4
        assert update_res.json()["settings"]["has_password"] is True


@pytest.mark.asyncio
async def test_test_email_endpoint():
    await init_db()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Missing fields should fail with 400
        res_fail = await client.post("/api/v1/notifications/test-email", json={
            "receiver_email": ""
        })
        assert res_fail.status_code == 400

        # 2. Mock send_smtp_email and verify success response
        with patch("app.api.v1.notifications.send_smtp_email") as mock_send:
            mock_send.return_value = {"success": True, "message": "邮件发送成功"}
            res_ok = await client.post("/api/v1/notifications/test-email", json={
                "receiver_email": "test@domain.com",
                "smtp_host": "smtp.domain.com",
                "smtp_port": 465,
                "smtp_user": "user@domain.com",
                "smtp_password": "auth_code_123",
                "smtp_use_ssl": True,
                "smtp_from_name": "Interview-Copilot",
            })
            assert res_ok.status_code == 200
            assert "测试邮件已成功发送" in res_ok.json()["message"]
            assert mock_send.called


@pytest.mark.asyncio
async def test_reminder_trigger_check():
    await init_db()
    # Create an upcoming schedule 1 hour from now
    target_time = datetime.utcnow() + timedelta(hours=1)
    async with AsyncSessionLocal() as session:
        schedule = InterviewSchedule(
            company="即将面试网络科技",
            job_role="全栈工程师",
            interview_round="终面",
            scheduled_at=target_time,
            location_type="online",
            meeting_link_or_address="https://meeting.example.com/123",
            status="upcoming",
            notes="系统设计与高可用",
        )
        session.add(schedule)
        await session.commit()
        await session.refresh(schedule)
        schedule_id = schedule.id

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Configure settings to enable email
        await client.post("/api/v1/notifications/settings", json={
            "email_enabled": True,
            "receiver_email": "candidate@example.com",
            "smtp_host": "smtp.example.com",
            "smtp_port": 465,
            "smtp_user": "bot@example.com",
            "smtp_password": "test_password",
            "smtp_use_ssl": True,
            "smtp_from_name": "Interview-Copilot",
            "remind_advance_hours": 2,
        })

        # Trigger check with mocked email send
        with patch("app.services.reminder_worker.send_smtp_email") as mock_worker_send:
            mock_worker_send.return_value = {"success": True}
            res_trigger = await client.post("/api/v1/notifications/trigger-check")
            assert res_trigger.status_code == 200
            data = res_trigger.json()
            assert data["status"] == "success"
            assert data["sent"] >= 1
            assert mock_worker_send.called

        # Verify email_reminded_at is now set
        async with AsyncSessionLocal() as session:
            s_after = await session.get(InterviewSchedule, schedule_id)
            assert s_after.email_reminded_at is not None

        # Subsequent check should not re-send because email_reminded_at is not None
        with patch("app.services.reminder_worker.send_smtp_email") as mock_worker_send2:
            res_trigger2 = await client.post("/api/v1/notifications/trigger-check")
            assert res_trigger2.status_code == 200
            # Should have sent 0 additional emails for this schedule
            assert not mock_worker_send2.called

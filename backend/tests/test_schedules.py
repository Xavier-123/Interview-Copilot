import pytest
from datetime import datetime, timedelta
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_schedules_lifecycle():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Create a schedule
        target_time = (datetime.utcnow() + timedelta(days=2)).isoformat()
        create_res = await client.post("/api/v1/schedules", json={
            "company": "测试科技",
            "job_role": "后端开发专家",
            "interview_round": "技术二面",
            "scheduled_at": target_time,
            "location_type": "online",
            "meeting_link_or_address": "https://meeting.tencent.com/dm/123456",
            "status": "upcoming",
            "jd_text": "熟悉微服务、高并发架构设计",
            "notes": "准备重点：深入讲解分库分表与MQ可靠性"
        })
        assert create_res.status_code == 200
        created_data = create_res.json()
        assert created_data["status"] == "success"
        schedule = created_data["schedule"]
        schedule_id = schedule["id"]
        assert schedule["company"] == "测试科技"
        assert schedule["status"] == "upcoming"

        # 2. Get schedule list
        list_res = await client.get("/api/v1/schedules")
        assert list_res.status_code == 200
        schedules = list_res.json()["schedules"]
        assert any(s["id"] == schedule_id for s in schedules)

        # 3. Filter schedule list by status
        filter_res = await client.get("/api/v1/schedules?status=upcoming")
        assert filter_res.status_code == 200
        assert any(s["id"] == schedule_id for s in filter_res.json()["schedules"])

        # 4. Get schedule detail
        detail_res = await client.get(f"/api/v1/schedules/{schedule_id}")
        assert detail_res.status_code == 200
        assert detail_res.json()["schedule"]["company"] == "测试科技"

        # 5. Update schedule (status to completed, change time, add notes)
        new_time = (datetime.utcnow() + timedelta(days=4)).isoformat()
        update_res = await client.put(f"/api/v1/schedules/{schedule_id}", json={
            "status": "completed",
            "scheduled_at": new_time,
            "notes": "面试已完成，面试官重点问了分库分表"
        })
        assert update_res.status_code == 200
        updated_schedule = update_res.json()["schedule"]
        assert updated_schedule["status"] == "completed"
        # 时区回归：API 必须返回带 UTC 标记的时间，否则前端 new Date() 会把 UTC 当本地时间渲染，
        # 表现为"编辑改了时间，保存后不起效果"
        assert updated_schedule["scheduled_at"].endswith("+00:00")
        assert updated_schedule["scheduled_at"].startswith(new_time[:16])

        # 6. Delete schedule
        delete_res = await client.delete(f"/api/v1/schedules/{schedule_id}")
        assert delete_res.status_code == 200
        assert delete_res.json()["status"] == "success"

        # 7. Verify deletion
        verify_res = await client.get(f"/api/v1/schedules/{schedule_id}")
        assert verify_res.status_code == 404


@pytest.mark.asyncio
async def test_schedule_salary_and_declined():
    """谈薪轮次：记录 Offer 薪资并以 declined（已婉拒）流转。"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        target_time = (datetime.utcnow() + timedelta(days=3)).isoformat()
        create_res = await client.post("/api/v1/schedules", json={
            "company": "谈薪科技",
            "job_role": "前端工程师",
            "interview_round": "谈薪",
            "scheduled_at": target_time,
            "location_type": "phone",
            "salary": "25k × 15",
            "status": "upcoming",
        })
        assert create_res.status_code == 200
        schedule = create_res.json()["schedule"]
        schedule_id = schedule["id"]
        assert schedule["interview_round"] == "谈薪"
        assert schedule["salary"] == "25k × 15"

        # 谈完后婉拒：状态流转为 declined，薪资可在更新时补充
        update_res = await client.put(f"/api/v1/schedules/{schedule_id}", json={
            "status": "declined",
            "salary": "28k × 16",
        })
        assert update_res.status_code == 200
        updated = update_res.json()["schedule"]
        assert updated["status"] == "declined"
        assert updated["salary"] == "28k × 16"

        # declined 状态可被列表过滤
        filter_res = await client.get("/api/v1/schedules?status=declined")
        assert filter_res.status_code == 200
        assert any(s["id"] == schedule_id for s in filter_res.json()["schedules"])

        delete_res = await client.delete(f"/api/v1/schedules/{schedule_id}")
        assert delete_res.status_code == 200

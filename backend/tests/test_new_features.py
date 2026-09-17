import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.db import init_db

@pytest.mark.asyncio
async def test_auth_and_profile_flow():
    await init_db()
    unique_user = f"user_{uuid.uuid4().hex[:8]}"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Register
        reg_res = await client.post("/api/v1/auth/register", json={
            "username": unique_user,
            "password": "secret_password_123",
            "email": f"{unique_user}@example.com",
            "real_name": "张开发",
            "target_role": "资深后端专家",
            "target_industry": "人工智能/大模型",
            "target_level": "senior",
            "experience_years": 4,
            "skills": ["Python", "FastAPI", "Redis"]
        })
        assert reg_res.status_code == 200
        reg_data = reg_res.json()
        assert "access_token" in reg_data
        token = reg_data["access_token"]
        assert reg_data["user"]["username"] == unique_user

        # 2. Login
        login_res = await client.post("/api/v1/auth/login", json={
            "username": unique_user,
            "password": "secret_password_123"
        })
        assert login_res.status_code == 200
        assert "access_token" in login_res.json()

        # 3. Get profile (/me)
        me_res = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me_res.status_code == 200
        me_data = me_res.json()
        assert me_data["profile"]["real_name"] == "张开发"
        assert me_data["profile"]["target_industry"] == "人工智能/大模型"

        # 4. Update profile
        update_res = await client.put("/api/v1/auth/profile", json={
            "real_name": "张资深",
            "experience_years": 5
        }, headers={"Authorization": f"Bearer {token}"})
        assert update_res.status_code == 200
        assert update_res.json()["profile"]["real_name"] == "张资深"

        # 5. Guest Login
        guest_res = await client.post("/api/v1/auth/guest")
        assert guest_res.status_code == 200
        assert guest_res.json()["user"]["is_guest"] is True

@pytest.mark.asyncio
async def test_file_upload_resume():
    await init_db()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Upload TXT file
        sample_file_content = b"Candidate: Li Si\nExperience: 5 years in backend.\nSkills: Python, Go, Kafka."
        files = {"file": ("resume.txt", sample_file_content, "text/plain")}
        res = await client.post("/api/v1/profiles/upload-resume", files=files)
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "success"
        assert "profile" in data
        assert "Li Si" in data["raw_text"]

@pytest.mark.asyncio
async def test_pause_resume_redo_flow():
    await init_db()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Create session with custom parameters
        session_res = await client.post("/api/v1/interviews/session", json={
            "resume_text": "张三，精通 Python 和 微服务",
            "jd_text": "资深后端开发",
            "interview_type": "management",
            "industry": "金融科技/量化",
            "job_role": "量化系统技术主管",
            "seniority": "director",
            "difficulty": "hard",
            "style": "rigorous",
            "language": "zh"
        })
        assert session_res.status_code == 200
        session_id = session_res.json()["session_id"]

        # 2. Start session
        start_res = await client.post(f"/api/v1/interviews/{session_id}/start")
        assert start_res.status_code == 200

        # 3. Answer 1
        ans_res = await client.post(f"/api/v1/interviews/{session_id}/answer", json={
            "message": "各位面试官好，我有8年大型金融系统研发与团队管理经验。"
        })
        assert ans_res.status_code == 200

        # 4. Pause session
        pause_res = await client.post(f"/api/v1/interviews/{session_id}/pause", json={"elapsed_seconds": 120})
        assert pause_res.status_code == 200
        assert pause_res.json()["status"] == "paused"

        # 5. Resume session
        resume_res = await client.post(f"/api/v1/interviews/{session_id}/resume")
        assert resume_res.status_code == 200
        assert resume_res.json()["status"] == "resumed"

        # 6. Redo turn
        redo_res = await client.post(f"/api/v1/interviews/{session_id}/redo")
        assert redo_res.status_code == 200
        assert redo_res.json()["status"] == "success"

@pytest.mark.asyncio
async def test_history_and_comparison():
    await init_db()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create session 1
        s1 = (await client.post("/api/v1/interviews/session", json={
            "resume_text": "开发工程师",
            "interview_type": "technical"
        })).json()["session_id"]
        await client.post(f"/api/v1/interviews/{s1}/start")
        await client.post(f"/api/v1/interviews/{s1}/finish")

        # Create session 2
        s2 = (await client.post("/api/v1/interviews/session", json={
            "resume_text": "资深开发工程师",
            "interview_type": "technical"
        })).json()["session_id"]
        await client.post(f"/api/v1/interviews/{s2}/start")
        await client.post(f"/api/v1/interviews/{s2}/finish")

        # Query history
        hist_res = await client.get("/api/v1/interviews/history")
        assert hist_res.status_code == 200
        hist_list = hist_res.json()["history"]
        assert len(hist_list) >= 2

        # Compare sessions
        comp_res = await client.post("/api/v1/interviews/history/compare", json={
            "session_id_1": s1,
            "session_id_2": s2
        })
        assert comp_res.status_code == 200
        comp_data = comp_res.json()
        assert "radar_comparison" in comp_data
        assert "overall_improvement" in comp_data
        assert len(comp_data["radar_comparison"]) == 6

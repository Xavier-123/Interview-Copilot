import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.db import init_db

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

@pytest.mark.asyncio
async def test_max_two_questions_and_simulate_answer_and_search():
    from app.services.search import search_service
    await init_db()

    # 1. Test search service
    outcome = await search_service.search("Redis 分布式锁看门狗机制")
    assert outcome.status in ("success", "failed")
    if outcome.status == "failed":
        assert outcome.results == []  # Failed searches must never fabricate sources.

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 2. Create session with web_search_enabled=True
        res = await client.post("/api/v1/interviews/session", json={
            "resume_text": "具备后端架构经验，精通分布式与微服务高可用设计",
            "jd_text": "资深后端开发，负责高并发与核心服务治理",
            "interview_type": "technical",
            "industry": "互联网/电商",
            "job_role": "后端开发",
            "seniority": "senior",
            "web_search_enabled": True
        })
        assert res.status_code == 200
        data = res.json()
        session_id = data["session_id"]
        assert data["web_search_enabled"] is True

        # 3. Test toggle-web-search endpoint
        toggle_res = await client.post(f"/api/v1/interviews/{session_id}/toggle-web-search", json={"enabled": False})
        assert toggle_res.status_code == 200
        assert toggle_res.json()["web_search_enabled"] is False

        toggle_res2 = await client.post(f"/api/v1/interviews/{session_id}/toggle-web-search")
        assert toggle_res2.status_code == 200
        assert toggle_res2.json()["web_search_enabled"] is True

        # 4. Start interview and verify questions <= 2 count
        start_res = await client.post(f"/api/v1/interviews/{session_id}/start")
        assert start_res.status_code == 200
        start_data = start_res.json()
        msgs = start_data["messages"]
        assert len(msgs) > 0
        last_msg = msgs[-1]["content"]
        q_count = last_msg.count("？") + last_msg.count("?")
        assert q_count <= 2, f"Expected <= 2 questions in turn, got {q_count}"

        # 5. Answer to trigger next interviewer turn
        ans_res = await client.post(f"/api/v1/interviews/{session_id}/answer", json={
            "message": "在电商交易项目中，我主导了基于微服务的秒杀下单模块，设计了分级过滤与分布式限流体系。"
        })
        assert ans_res.status_code == 200
        ans_data = ans_res.json()
        tech_msg = ans_data["messages"][-1]["content"]
        tech_q_count = tech_msg.count("？") + tech_msg.count("?")
        assert tech_q_count <= 2, f"Expected <= 2 questions in technical turn, got {tech_q_count}"

        # 6. Test simulate standard answer
        sim_res = await client.post(f"/api/v1/interviews/{session_id}/simulate-answer")
        assert sim_res.status_code == 200
        sim_data = sim_res.json()
        assert "standard_answer" in sim_data
        assert "question" in sim_data
        assert sim_data["web_search_used"] is (
            (sim_data.get("search_metadata") or {}).get("status") == "success"
        )
        assert len(sim_data["standard_answer"]) > 50
        assert "我" in sim_data["standard_answer"]  # First-person answer!

@pytest.mark.asyncio
async def test_programmer_interview_flow():
    await init_db()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Create programmer session with max_rounds=8
        create_res = await client.post("/api/v1/interviews/session", json={
            "resume_text": "张三，4年后端研发，精通 Python 与 Redis，主导过高并发订单履约系统",
            "jd_text": "资深后端开发工程师，负责核心交易链路研发",
            "interview_type": "programmer",
            "industry": "互联网/电商",
            "job_role": "资深后端开发",
            "max_rounds": 8
        })
        assert create_res.status_code == 200
        create_data = create_res.json()
        assert create_data["interview_mode"]["interview_type"] == "programmer"
        assert "程序员综合面" in create_data["title"]
        session_id = create_data["session_id"]

        # 2. Start -> orchestrator welcome
        start_res = await client.post(f"/api/v1/interviews/{session_id}/start")
        assert start_res.status_code == 200
        assert start_res.json()["messages"][-1]["name"] == "orchestrator"

        # 3. Answer self-intro -> programmer interviewer takes over directly
        ans1 = await client.post(f"/api/v1/interviews/{session_id}/answer", json={
            "message": "面试官好，我是张三，4年后端经验，主导过亿级订单履约系统。"
        })
        assert ans1.status_code == 200
        ans1_data = ans1.json()
        assert ans1_data["current_interviewer"] == "programmer"
        assert ans1_data["messages"][-1]["name"] == "programmer"

        # 4. max_rounds passthrough
        state = (await client.get(f"/api/v1/interviews/{session_id}")).json()
        assert state["max_rounds"] == 8

        # 5. Second answer -> observer routes back to programmer
        ans2 = await client.post(f"/api/v1/interviews/{session_id}/answer", json={
            "message": "订单履约系统里我负责支付后的分发链路，用 Redis 分布式锁防击穿。"
        })
        assert ans2.status_code == 200
        assert ans2.json()["current_interviewer"] == "programmer"

@pytest.mark.asyncio
async def test_unknown_answer_switches_topic_immediately():
    await init_db()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/api/v1/interviews/session", json={
            "resume_text": "李四，5年研发经验",
            "interview_type": "hr",
            "job_role": "后端开发"
        })
        session_id = res.json()["session_id"]
        await client.post(f"/api/v1/interviews/{session_id}/start")

        # Self intro -> hr first question
        await client.post(f"/api/v1/interviews/{session_id}/answer", json={
            "message": "你好，我是李四，5年后端经验，负责过支付网关。"
        })

        # Answer with an explicit "don't know"
        ans = await client.post(f"/api/v1/interviews/{session_id}/answer", json={
            "message": "这个我不知道，没了解过。"
        })
        assert ans.status_code == 200
        last_reply = ans.json()["messages"][-1]["content"]
        assert len(last_reply) > 0

        # Observer decision: immediate topic switch, no dwelling
        state = (await client.get(f"/api/v1/interviews/{session_id}")).json()
        assert state["dig_action"] == "SWITCH_TOPIC"
        assert state["switch_reason"] == "failed"
        assert state["last_answer_status"] == "unknown"
        assert state["follow_up_hint"] is None

@pytest.mark.asyncio
async def test_message_persistence_user_and_assistant():
    await init_db()
    from sqlalchemy import select
    from app.models.db import AsyncSessionLocal
    from app.models.interview import InterviewMessageModel

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/api/v1/interviews/session", json={
            "resume_text": "王五，3年研发经验",
            "interview_type": "hr"
        })
        session_id = res.json()["session_id"]
        await client.post(f"/api/v1/interviews/{session_id}/start")
        await client.post(f"/api/v1/interviews/{session_id}/answer", json={
            "message": "面试官好，我是王五。"
        })

        async def fetch_rows():
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(InterviewMessageModel)
                    .where(InterviewMessageModel.session_id == session_id)
                    .order_by(InterviewMessageModel.seq)
                )
                return result.scalars().all()

        rows = await fetch_rows()
        roles = [r.role for r in rows]
        assert "user" in roles, "candidate answer must be persisted"
        assert "assistant" in roles
        assert roles[0] == "assistant"
        assert [r.seq for r in rows] == list(range(len(rows)))

        state_msgs = (await client.get(f"/api/v1/interviews/{session_id}")).json()["messages"]
        assert len(rows) == len(state_msgs)

        # Redo rolls back the last Q&A pair in the message table too
        redo = await client.post(f"/api/v1/interviews/{session_id}/redo")
        assert redo.status_code == 200
        rows_after = await fetch_rows()
        assert len(rows_after) == len(rows) - 2

@pytest.mark.asyncio
async def test_transcript_view_and_export():
    await init_db()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/api/v1/interviews/session", json={
            "resume_text": "赵六，4年研发经验，精通 Python",
            "jd_text": "资深后端开发",
            "interview_type": "programmer",
            "job_role": "后端开发"
        })
        session_id = res.json()["session_id"]
        await client.post(f"/api/v1/interviews/{session_id}/start")
        await client.post(f"/api/v1/interviews/{session_id}/answer", json={
            "message": "面试官好，我是赵六，4年 Python 后端经验。"
        })
        # Second answer triggers the shadow observer (interview stage) -> evaluation log
        await client.post(f"/api/v1/interviews/{session_id}/answer", json={
            "message": "我在订单履约项目里负责支付后的分发链路，用 Redis 分布式锁防缓存击穿。"
        })

        # Transcript (online viewing)
        t_res = await client.get(f"/api/v1/interviews/{session_id}/transcript")
        assert t_res.status_code == 200
        transcript = t_res.json()
        assert len(transcript["messages"]) >= 5
        assert transcript["session"]["job_role"] == "后端开发"
        assert len(transcript["observations"]) >= 1

        # Export markdown
        md_res = await client.get(f"/api/v1/interviews/{session_id}/export?format=markdown")
        assert md_res.status_code == 200
        assert "attachment" in md_res.headers.get("content-disposition", "")
        assert "对话记录" in md_res.text
        assert "候选人" in md_res.text

        # Export json
        json_res = await client.get(f"/api/v1/interviews/{session_id}/export?format=json")
        assert json_res.status_code == 200
        assert "application/json" in json_res.headers.get("content-type", "")
        parsed = json_res.json()
        assert parsed["session"]["session_id"] == session_id

        # 404 for unknown session
        missing = await client.get("/api/v1/interviews/nonexistent-id/transcript")
        assert missing.status_code == 404

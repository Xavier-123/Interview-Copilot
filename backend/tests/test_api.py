import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_health_check():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "Interview-Copilot" in data["project"]

@pytest.mark.asyncio
async def test_api_session_lifecycle():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Create session
        res = await client.post("/api/v1/interviews/session", json={
            "resume_text": "张三，精通 Python, 微服务，高并发",
            "jd_text": "资深研发专家，负责架构设计",
            "difficulty": "senior",
            "style": "rigorous",
            "language": "zh"
        })
        assert res.status_code == 200
        data = res.json()
        session_id = data["session_id"]
        assert session_id is not None
        assert "candidate_profile" in data

        # 2. Start session
        res_start = await client.post(f"/api/v1/interviews/{session_id}/start")
        assert res_start.status_code == 200
        start_data = res_start.json()
        assert start_data["stage"] == "self_intro"
        assert len(start_data["messages"]) >= 1

        # 3. Submit self intro answer
        res_answer = await client.post(f"/api/v1/interviews/{session_id}/answer", json={
            "message": "各位面试官好，我叫张三，拥有4年后端架构实战经验。"
        })
        assert res_answer.status_code == 200
        ans_data = res_answer.json()
        assert ans_data["stage"] == "technical"
        assert ans_data["current_interviewer"] == "technical"

        # 3.5 Submit technical answer with code
        res_code = await client.post(f"/api/v1/interviews/{session_id}/answer", json={
            "message": "这是我的解题思路与核心实现：",
            "code": "def binary_search(nums, target):\n    return -1",
            "code_language": "python"
        })
        assert res_code.status_code == 200
        code_data = res_code.json()
        assert code_data["current_code"] == "def binary_search(nums, target):\n    return -1"
        assert code_data["code_language"] == "python"

        # 4. Request lifeline
        res_life = await client.post(f"/api/v1/interviews/{session_id}/lifeline")
        assert res_life.status_code == 200
        life_data = res_life.json()
        assert "hint" in life_data
        assert life_data["lifelines_used"] == 1

        # 5. Finish and get report
        res_finish = await client.post(f"/api/v1/interviews/{session_id}/finish")
        assert res_finish.status_code == 200
        finish_data = res_finish.json()
        assert "report" in finish_data
        assert "radar_scores" in finish_data["report"]
        assert "detailed_reviews" in finish_data["report"]

        # 6. Query cached report
        res_report = await client.get(f"/api/v1/interviews/{session_id}/report")
        assert res_report.status_code == 200
        assert res_report.json()["match_verdict"] in ["强烈推荐", "建议通过", "待定待评估", "不予考虑"]

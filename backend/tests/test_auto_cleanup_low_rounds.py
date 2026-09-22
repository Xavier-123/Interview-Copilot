import asyncio
import pytest
from unittest.mock import AsyncMock, patch
from langchain_core.messages import AIMessage
from sqlalchemy import select

from app.models.db import AsyncSessionLocal, init_db
from app.models.interview import InterviewSessionModel, InterviewMessageModel, InterviewReportModel
from app.services.session_manager import SessionManager, MIN_PERSIST_ROUNDS


def _fake_report(tag: str = "ok") -> dict:
    return {
        "match_verdict": f"建议通过-{tag}",
        "overall_summary": f"第{tag}次评估",
        "radar_scores": {
            "technical_depth": 8.0, "technical_breadth": 8.0,
            "communication_logic": 8.0, "star_completeness": 8.0,
            "stress_resilience": 8.0, "job_matching": 8.0,
        },
        "strengths": ["技术扎实"],
        "weaknesses": [],
        "detailed_reviews": [{"interviewer": "technical", "comment": "表现良好"}],
        "learning_plan": [],
        "seven_day_roadmap": [],
        "drill_cards": [],
    }


@pytest.mark.asyncio
async def test_auto_cleanup_and_min_rounds_history():
    await init_db()
    mgr = SessionManager()

    with patch("app.services.parser.parser_service.parse_resume", new_callable=AsyncMock) as pr, \
         patch("app.services.parser.parser_service.parse_jd", new_callable=AsyncMock) as pj:
        pr.return_value = {"name": "测试用户", "skills": ["Python"]}
        pj.return_value = {"title": "后端工程师", "required_skills": ["Python"]}

        # 1. 创建 0 轮会话
        s0 = await mgr.create_session(resume_text="t", jd_text="t", job_role="0轮测试")
        sid0 = s0["session_id"]

        # 2. 创建 2 轮会话并手动模拟 2 轮
        s2 = await mgr.create_session(resume_text="t", jd_text="t", job_role="2轮测试")
        sid2 = s2["session_id"]
        s2["round_count"] = 2
        await mgr._sync_state_to_db(sid2, s2)

        # 3. 创建 3 轮有效会话
        s3 = await mgr.create_session(resume_text="t", jd_text="t", job_role="3轮测试")
        sid3 = s3["session_id"]
        s3["round_count"] = 3
        await mgr._sync_state_to_db(sid3, s3)

        # 4. 创建 4 轮有效会话并生成报告
        s4 = await mgr.create_session(resume_text="t", jd_text="t", job_role="4轮测试")
        sid4 = s4["session_id"]
        s4["round_count"] = 4
        await mgr._sync_state_to_db(sid4, s4)

        with patch("app.services.session_manager.generate_evaluation_report", new_callable=AsyncMock) as gen, \
             patch("app.services.session_manager.audit_service.audit_session", new_callable=AsyncMock):
            gen.side_effect = lambda st: _fake_report("4轮")
            await mgr.finish_and_evaluate(sid4)

        # 验证 cleanup_incomplete_sessions 能够识别并删除 < 3 轮的会话
        deleted = await mgr.cleanup_incomplete_sessions(min_rounds=MIN_PERSIST_ROUNDS)
        assert deleted >= 2, f"Expected at least 2 deleted incomplete sessions, got {deleted}"

        # 验证数据库中已经不存在 sid0 和 sid2
        async with AsyncSessionLocal() as db:
            r0 = await db.get(InterviewSessionModel, sid0)
            r2 = await db.get(InterviewSessionModel, sid2)
            r3 = await db.get(InterviewSessionModel, sid3)
            r4 = await db.get(InterviewSessionModel, sid4)

            assert r0 is None, "0轮会话应已被自动清理"
            assert r2 is None, "2轮会话应已被自动清理"
            assert r3 is not None, "3轮会话应保留"
            assert r4 is not None, "4轮会话应保留"

        # 验证 get_history 仅返回 round_count >= 3 的记录
        history = await mgr.get_history(min_rounds=3, auto_cleanup=False)
        returned_ids = [h["session_id"] for h in history]
        assert sid0 not in returned_ids
        assert sid2 not in returned_ids
        assert sid3 in returned_ids
        assert sid4 in returned_ids
        for item in history:
            assert item["round_count"] >= 3, f"Session {item['session_id']} has round_count < 3"

        # 清理测试产生的 s3 和 s4
        await mgr.delete_sessions([sid3, sid4])


@pytest.mark.asyncio
async def test_finish_under_3_rounds_does_not_persist():
    await init_db()
    mgr = SessionManager()

    with patch("app.services.parser.parser_service.parse_resume", new_callable=AsyncMock) as pr, \
         patch("app.services.parser.parser_service.parse_jd", new_callable=AsyncMock) as pj:
        pr.return_value = {"name": "测试用户", "skills": ["Python"]}
        pj.return_value = {"title": "后端工程师", "required_skills": ["Python"]}

        s1 = await mgr.create_session(resume_text="t", jd_text="t", job_role="1轮测试")
        sid1 = s1["session_id"]
        s1["round_count"] = 1
        await mgr._sync_state_to_db(sid1, s1)

        with patch("app.services.session_manager.generate_evaluation_report", new_callable=AsyncMock) as gen, \
             patch("app.services.session_manager.audit_service.audit_session", new_callable=AsyncMock):
            gen.side_effect = lambda st: _fake_report("1轮")
            report = await mgr.finish_and_evaluate(sid1)
            assert report is not None

        # 验证不足 3 轮时，不会在数据库中持久化 InterviewReportModel 与 InterviewSessionModel
        async with AsyncSessionLocal() as db:
            r = await db.get(InterviewSessionModel, sid1)
            assert r is None, "不足3轮提前结束的会话不应保存在数据库中"
            rep = (await db.execute(
                select(InterviewReportModel).where(InterviewReportModel.session_id == sid1)
            )).scalar_one_or_none()
            assert rep is None, "不足3轮不应在数据库生成复盘报告记录"

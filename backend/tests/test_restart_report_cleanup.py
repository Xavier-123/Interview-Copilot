"""
restart_session 报告清理回归测试：
重开一场必须同时清掉旧报告（内存缓存 + interview_reports 表），否则：
- 重开后的面试在历史页仍显示 has_report=true
- 服务重启后 get_session_detail 会从库里恢复旧报告
- 新一轮结束时再次插入报告会触发 session_id 唯一键冲突（unique=True）
"""
import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from langchain_core.messages import AIMessage
from sqlalchemy import select

from app.models.db import AsyncSessionLocal, init_db
from app.models.interview import InterviewReportModel
from app.services.session_manager import SessionManager


def _fake_report(tag: str) -> dict:
    return {
        "match_verdict": f"建议通过-{tag}",
        "overall_summary": f"第{tag}次评估",
        "radar_scores": {
            "technical_depth": 7.0, "technical_breadth": 7.0,
            "communication_logic": 7.0, "star_completeness": 7.0,
            "stress_resilience": 7.0, "job_matching": 7.0,
        },
        "strengths": [f"亮点{tag}"],
        "weaknesses": [],
        "detailed_reviews": [{"interviewer": "technical", "comment": f"评价{tag}"}],
        "learning_plan": [],
        "seven_day_roadmap": [],
        "drill_cards": [],
    }


class TestRestartReportCleanup(unittest.IsolatedAsyncioTestCase):

    async def test_restart_clears_old_report_and_allows_fresh_finish(self):
        await init_db()
        mgr = SessionManager()

        with patch("app.services.parser.parser_service.parse_resume", new_callable=AsyncMock) as pr, \
             patch("app.services.parser.parser_service.parse_jd", new_callable=AsyncMock) as pj, \
             patch("app.agents.llm.llm_service.invoke", new_callable=AsyncMock) as mock_llm:
            pr.side_effect = lambda resume_text, llm_config=None: {"name": "张三", "skills": ["Python"]}
            pj.side_effect = lambda jd_text, llm_config=None: {"title": "高级后端工程师", "required_skills": ["Python"]}
            mock_llm.return_value = AIMessage(content="欢迎参加本次模拟面试")

            state = await mgr.create_session(
                resume_text="张三，精通 Python", jd_text="高级后端工程师",
                interview_type="technical",
            )
            sid = state["session_id"]
            await mgr.start_session(sid)

            # 第一轮结束并生成报告
            with patch("app.services.session_manager.generate_evaluation_report", new_callable=AsyncMock) as gen, \
                 patch("app.services.session_manager.audit_service.audit_session", new_callable=AsyncMock):
                gen.side_effect = lambda st: _fake_report("一")
                report1 = await mgr.finish_and_evaluate(sid)

            self.assertEqual(report1["match_verdict"], "建议通过-一")
            pre_history = await mgr.get_history()
            self.assertTrue(
                next(h for h in pre_history if h["session_id"] == sid)["has_report"],
                "前置条件失败：首轮结束后应有报告",
            )

            # ── 重开一场 ──
            await mgr.restart_session(sid)

            # 1. 内存报告缓存已清空
            self.assertNotIn(sid, mgr._reports)

            # 2. DB 报告行已删除
            async with AsyncSessionLocal() as db:
                rows = (await db.execute(
                    select(InterviewReportModel).where(InterviewReportModel.session_id == sid)
                )).scalars().all()
            self.assertEqual(rows, [], "重开后 interview_reports 表仍残留旧报告")

            # 3. 模拟服务重启：全新管理器（缓存为空）也不能从库里恢复旧报告
            fresh_mgr = SessionManager()
            detail = await fresh_mgr.get_session_detail(sid)
            self.assertIsNone(detail.get("report"))

            # 4. 历史列表不再显示 has_report
            history = await fresh_mgr.get_history()
            self.assertFalse(
                next(h for h in history if h["session_id"] == sid)["has_report"],
                "重开后历史页仍显示 has_report=true",
            )

            # ── 新一轮重新结束：应生成全新报告，不触发唯一键冲突 ──
            with patch("app.services.session_manager.generate_evaluation_report", new_callable=AsyncMock) as gen2, \
                 patch("app.services.session_manager.audit_service.audit_session", new_callable=AsyncMock):
                gen2.side_effect = lambda st: _fake_report("二")
                report2 = await mgr.finish_and_evaluate(sid)

            self.assertEqual(report2["match_verdict"], "建议通过-二", "新一轮结束应生成全新报告而不是复用旧报告")

            async with AsyncSessionLocal() as db:
                rows2 = (await db.execute(
                    select(InterviewReportModel).where(InterviewReportModel.session_id == sid)
                )).scalars().all()
            self.assertEqual(len(rows2), 1, "新一轮结束应恰好写入一份报告")
            self.assertEqual(rows2[0].match_verdict, "建议通过-二")

            # DB 中的最终报告即新一轮报告（不是旧报告）
            detail2 = await fresh_mgr.get_session_detail(sid)
            self.assertEqual(detail2["report"]["match_verdict"], "建议通过-二")

    async def test_concurrent_finish_generates_report_once(self):
        """并发触发 finish：锁 + 缓存 + DB 恢复三层防护下，报告只生成/插入一次。"""
        await init_db()
        mgr = SessionManager()

        with patch("app.services.parser.parser_service.parse_resume", new_callable=AsyncMock) as pr, \
             patch("app.services.parser.parser_service.parse_jd", new_callable=AsyncMock) as pj, \
             patch("app.agents.llm.llm_service.invoke", new_callable=AsyncMock) as mock_llm:
            pr.side_effect = lambda resume_text, llm_config=None: {"name": "李四", "skills": ["Go"]}
            pj.side_effect = lambda jd_text, llm_config=None: {"title": "后端专家", "required_skills": ["Go"]}
            mock_llm.return_value = AIMessage(content="欢迎")

            state = await mgr.create_session(
                resume_text="李四，精通 Go", jd_text="后端专家",
                interview_type="technical",
            )
            sid = state["session_id"]
            await mgr.start_session(sid)

        with patch("app.services.session_manager.generate_evaluation_report", new_callable=AsyncMock) as gen, \
             patch("app.services.session_manager.audit_service.audit_session", new_callable=AsyncMock):
            gen.side_effect = lambda st: _fake_report("并发")
            results = await asyncio.gather(
                mgr.finish_and_evaluate(sid),
                mgr.finish_and_evaluate(sid),
            )

        # 两个请求拿到同一份报告，且报告生成只执行了一次
        self.assertEqual(results[0]["match_verdict"], results[1]["match_verdict"])
        self.assertEqual(gen.await_count, 1, "并发 finish 不应重复生成报告")

        async with AsyncSessionLocal() as db:
            rows = (await db.execute(
                select(InterviewReportModel).where(InterviewReportModel.session_id == sid)
            )).scalars().all()
        self.assertEqual(len(rows), 1, "并发 finish 不应插入重复报告行（session_id 唯一键）")


if __name__ == "__main__":
    unittest.main()

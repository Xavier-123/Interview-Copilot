"""
redo_turn 状态回滚完整性测试：
重答本题不仅要回滚消息/轮次/评估日志，还必须恢复本轮作答前的
考官决策状态（current_topic / topic_depth / dig_action / condensed_memory /
follow_up_hint / stress_triggered / stage 等），否则影子观察员和下一轮
面试官会沿用上一轮回答留下的判断。
"""
import copy
import json
import unittest
from unittest.mock import AsyncMock, patch

from langchain_core.messages import AIMessage

from app.services.session_manager import SessionManager
from app.services.search import search_service  # noqa: F401  (确保 import 路径可用)
from app.models.db import init_db


def make_state(**overrides) -> dict:
    """构造一个处于 technical 阶段、刚回答完第 2 题之后的状态（turn 后）。"""
    state = {
        "session_id": overrides.get("session_id", "redo_test_session"),
        "title": "后端开发 - 技术深度面模拟面试",
        "stage": "technical",
        "current_interviewer": "technical",
        "next_interviewer": "candidate",
        "interview_type": "technical",
        "industry": "互联网/电商",
        "job_role": "后端开发",
        "seniority": "senior",
        "difficulty": "standard",
        "style": "rigorous",
        "language": "zh",
        "custom_config": None,
        "company_scenario": None,
        "web_search_enabled": False,
        "round_count": 2,
        "max_rounds": 6,
        "tech_rounds_target": 5,
        "hr_rounds_target": 1,
        "mgmt_rounds_target": 3,
        "stress_triggered": False,
        "current_topic": "MySQL事务与MVCC",
        "topic_depth": 2,
        "last_satisfaction_score": 0.65,
        "last_answer_status": "surface",
        "dig_action": "PROBE_WEAKNESS",
        "switch_reason": None,
        "next_topic_hint": "Redis分布式锁",
        "follow_up_hint": "请补充 undo log 的具体作用",
        "break_routine_hint": None,
        "candidate_profile": {"name": "张三", "skills": ["MySQL", "Redis"]},
        "jd_requirements": {"title": "资深后端开发"},
        "interview_mode": {"style": "rigorous", "language": "zh"},
        "messages": [
            {"role": "assistant", "name": "technical", "content": "第1题：介绍MySQL事务隔离级别", "stage": "technical", "timestamp": "t0", "search_metadata": None},
            {"role": "user", "name": "candidate", "content": "第1题的回答", "stage": "technical", "timestamp": "t1", "search_metadata": None},
            {"role": "assistant", "name": "technical", "content": "第2题：谈谈MVCC的ReadView", "stage": "technical", "timestamp": "t2", "search_metadata": None},
            {"role": "user", "name": "candidate", "content": "MVCC大概是通过版本链实现的吧", "stage": "technical", "timestamp": "t3", "search_metadata": None},
            {"role": "assistant", "name": "technical", "content": "追问：ReadView何时生成？", "stage": "technical", "timestamp": "t4", "search_metadata": None},
        ],
        "condensed_memory": "• 轮次1 [MySQL事务与MVCC]: 候选人说明了隔离级别\n• 轮次2 [MySQL事务与MVCC]: 候选人提到版本链",
        "current_code": None,
        "code_language": "python",
        "lifelines_used": 0,
        "latest_user_input": "MVCC大概是通过版本链实现的吧",
        "evaluation_logs": [
            {"round_index": 1, "interviewer": "technical", "topic": "MySQL事务与MVCC", "satisfaction_score": 0.85, "answer_status": "solid"},
            {"round_index": 2, "interviewer": "technical", "topic": "MySQL事务与MVCC", "satisfaction_score": 0.65, "answer_status": "surface"},
        ],
        "status": "waiting_user",
    }
    state.update(overrides)
    return state


def make_pre_turn_snapshot(state: dict) -> dict:
    """模拟第 2 题提交前的快照（即回滚目标）：回到刚问完第 2 题时。"""
    return {
        "stage": "technical",
        "current_interviewer": "technical",
        "next_interviewer": "candidate",
        "round_count": 1,
        "stress_triggered": False,
        "current_topic": "MySQL事务与MVCC",
        "topic_depth": 1,
        "last_satisfaction_score": 0.85,
        "last_answer_status": "solid",
        "dig_action": "DEEP_DIVE",
        "switch_reason": None,
        "next_topic_hint": None,
        "follow_up_hint": None,
        "break_routine_hint": None,
        "condensed_memory": "• 轮次1 [MySQL事务与MVCC]: 候选人说明了隔离级别",
        "evaluation_logs": [
            {"round_index": 1, "interviewer": "technical", "topic": "MySQL事务与MVCC", "satisfaction_score": 0.85, "answer_status": "solid"},
        ],
    }


class TestRedoTurnStateRestore(unittest.IsolatedAsyncioTestCase):

    async def test_redo_restores_decision_state_from_snapshot(self):
        """redo 后决策字段必须回到作答前快照，而不是沿用本轮回答留下的判断。"""
        mgr = SessionManager()
        state = make_state()
        state["turn_snapshots"] = [make_pre_turn_snapshot(state)]
        mgr._sessions[state["session_id"]] = state

        res = await mgr.redo_turn(state["session_id"])
        self.assertEqual(res["status"], "success")

        restored = mgr._sessions[state["session_id"]]
        # 消息回滚：只保留第2题的问题
        self.assertEqual(len(restored["messages"]), 3)
        self.assertEqual(restored["messages"][-1]["content"], "第2题：谈谈MVCC的ReadView")
        # 决策状态恢复为作答前快照
        self.assertEqual(restored["round_count"], 1)
        self.assertEqual(restored["topic_depth"], 1)
        self.assertEqual(restored["dig_action"], "DEEP_DIVE")
        self.assertEqual(restored["current_topic"], "MySQL事务与MVCC")
        self.assertEqual(restored["last_satisfaction_score"], 0.85)
        self.assertEqual(restored["last_answer_status"], "solid")
        self.assertIsNone(restored["follow_up_hint"])
        self.assertEqual(
            restored["condensed_memory"],
            "• 轮次1 [MySQL事务与MVCC]: 候选人说明了隔离级别",
        )
        self.assertFalse(restored["stress_triggered"])
        self.assertEqual(restored["stage"], "technical")
        # 评估日志只剩第 1 轮
        self.assertEqual(len(restored["evaluation_logs"]), 1)
        self.assertEqual(restored["evaluation_logs"][0]["round_index"], 1)
        # 残留回答清空，避免观察员误判旧答案
        self.assertIsNone(restored["latest_user_input"])
        self.assertEqual(restored["status"], "waiting_user")
        # 快照已消费
        self.assertEqual(restored["turn_snapshots"], [])

    async def test_chained_redo_uses_previous_snapshots(self):
        """连续两次 redo 应依次回退两轮，各自恢复对应的决策快照。"""
        mgr = SessionManager()
        state = make_state(round_count=3, topic_depth=3, dig_action="DEEP_DIVE")
        snapshot_r2 = make_pre_turn_snapshot(state)  # 第3题作答前
        snapshot_r1 = dict(snapshot_r2, round_count=0, topic_depth=0, dig_action="INIT",
                           condensed_memory="", evaluation_logs=[])
        state["turn_snapshots"] = [snapshot_r1, snapshot_r2]
        state["messages"] = state["messages"] + [
            {"role": "user", "name": "candidate", "content": "第3题的回答", "stage": "technical", "timestamp": "t5", "search_metadata": None},
            {"role": "assistant", "name": "technical", "content": "第4题：极端并发下怎么办", "stage": "technical", "timestamp": "t6", "search_metadata": None},
        ]
        state["evaluation_logs"] = state["evaluation_logs"] + [
            {"round_index": 3, "interviewer": "technical", "topic": "MySQL事务与MVCC", "satisfaction_score": 0.9, "answer_status": "solid"},
        ]
        mgr._sessions[state["session_id"]] = state

        await mgr.redo_turn(state["session_id"])
        mid = mgr._sessions[state["session_id"]]
        self.assertEqual(mid["round_count"], 1)
        self.assertEqual(mid["topic_depth"], 1)
        self.assertEqual(mid["dig_action"], "DEEP_DIVE")
        self.assertEqual(len(mid["evaluation_logs"]), 1)

        await mgr.redo_turn(state["session_id"])
        first = mgr._sessions[state["session_id"]]
        self.assertEqual(first["round_count"], 0)
        self.assertEqual(first["topic_depth"], 0)
        self.assertEqual(first["dig_action"], "INIT")
        self.assertEqual(first["condensed_memory"], "")
        self.assertEqual(first["evaluation_logs"], [])
        # 第二次 redo 回退到只剩第1题与第1次回答（消息成对回滚）
        self.assertEqual(len(first["messages"]), 3)
        self.assertEqual(first["messages"][-1]["content"], "第2题：谈谈MVCC的ReadView")

    async def test_redo_legacy_session_fallback(self):
        """旧会话（无快照）redo 仍应回滚消息/轮次/日志，并清空残留回答。"""
        mgr = SessionManager()
        state = make_state()
        state.pop("turn_snapshots", None)
        state["latest_user_input"] = "旧的回答"
        mgr._sessions[state["session_id"]] = state

        res = await mgr.redo_turn(state["session_id"])
        self.assertEqual(res["status"], "success")
        restored = mgr._sessions[state["session_id"]]
        self.assertEqual(len(restored["messages"]), 3)
        self.assertEqual(restored["round_count"], 1)
        self.assertEqual(len(restored["evaluation_logs"]), 1)
        self.assertIsNone(restored["latest_user_input"])

    async def test_redo_without_redoable_pair_warns(self):
        mgr = SessionManager()
        state = make_state(messages=[make_state()["messages"][0]])
        mgr._sessions[state["session_id"]] = state
        res = await mgr.redo_turn(state["session_id"])
        self.assertEqual(res["status"], "warning")

    async def test_submit_snapshots_decision_state_before_turn(self):
        """提交回答时必须在图调用前快照决策字段，并挂到新状态上供 redo 使用。"""
        mgr = SessionManager()
        state = make_state()
        state["turn_snapshots"] = []
        mgr._sessions[state["session_id"]] = state

        fake_new_state = dict(state)
        fake_new_state["messages"] = state["messages"] + [
            {"role": "user", "name": "candidate", "content": "新回答", "stage": "technical", "timestamp": "t7", "search_metadata": None},
            {"role": "assistant", "name": "technical", "content": "第3题", "stage": "technical", "timestamp": "t8", "search_metadata": None},
        ]
        fake_new_state["round_count"] = 3
        fake_new_state["topic_depth"] = 3

        with patch("app.services.session_manager.interview_app") as mock_graph:
            mock_graph.ainvoke = AsyncMock(return_value=fake_new_state)
            await mgr.submit_candidate_answer(state["session_id"], "新回答")

        mock_graph.ainvoke.assert_awaited_once()
        graph_input = mock_graph.ainvoke.await_args.args[0]
        # 图输入不应携带快照通道
        self.assertNotIn("turn_snapshots", graph_input)

        cached = mgr._sessions[state["session_id"]]
        snapshots = cached["turn_snapshots"]
        self.assertEqual(len(snapshots), 1)
        snap = snapshots[0]
        # 快照是提交前的值，而不是本轮改写后的值
        self.assertEqual(snap["round_count"], 2)
        self.assertEqual(snap["topic_depth"], 2)
        self.assertEqual(snap["dig_action"], "PROBE_WEAKNESS")
        self.assertEqual(snap["condensed_memory"], state["condensed_memory"])
        self.assertEqual(len(snap["evaluation_logs"]), 2)
        # 提交后的缓存状态仍保留本轮改写结果
        self.assertEqual(cached["round_count"], 3)
        self.assertEqual(cached["topic_depth"], 3)


class TestRedoTrueReAnswer(unittest.IsolatedAsyncioTestCase):
    """走真实图 + mock LLM：重答同一题必须得到与首次作答一致的观察员决策。"""

    OBSERVER_JSON = json.dumps({
        "topic": "MySQL事务与MVCC",
        "satisfaction_score": 0.65,
        "strengths": ["了解基本概念"],
        "weaknesses": ["对底层原理含糊"],
        "follow_up_hint": "追问 ReadView 生成时机",
        "depth_score": 6.5,
        "logic_score": 6.0,
        "flags": ["vague_answer"]
    })
    QUESTION_TEXT = "追问：ReadView 何时生成？"

    async def test_reanswer_after_redo_matches_first_observation(self):
        await init_db()
        mgr = SessionManager()
        sid = "redo_true_reanswer_session"
        pre_turn = make_state(session_id=sid, round_count=1, topic_depth=1,
                              dig_action="DEEP_DIVE", last_satisfaction_score=0.85,
                              last_answer_status="solid",
                              condensed_memory="• 轮次1 [MySQL事务与MVCC]: 候选人说明了隔离级别",
                              follow_up_hint=None, next_topic_hint=None,
                              messages=[make_state()["messages"][2]])  # 只有第2题问题
        pre_turn["evaluation_logs"] = [make_state()["evaluation_logs"][0]]
        pre_turn["latest_user_input"] = None
        pre_turn["status"] = "waiting_user"
        mgr._sessions[sid] = pre_turn

        async def fake_invoke(messages, llm_config=None):
            human = messages[1].content
            if "影子观察员" in human:
                return AIMessage(content=f"```json\n{self.OBSERVER_JSON}\n```")
            return AIMessage(content=self.QUESTION_TEXT)

        answer = "MVCC大概是通过版本链实现的吧"
        with patch("app.agents.llm.llm_service.invoke", new_callable=AsyncMock) as mock_invoke:
            mock_invoke.side_effect = fake_invoke

            first = copy.deepcopy(await mgr.submit_candidate_answer(sid, answer))

            redo_res = await mgr.redo_turn(sid)
            self.assertEqual(redo_res["status"], "success")
            mid = mgr._sessions[sid]
            # 回到作答前：决策状态与首答前一致
            self.assertEqual(mid["round_count"], 1)
            self.assertEqual(mid["topic_depth"], 1)
            self.assertEqual(mid["dig_action"], "DEEP_DIVE")
            self.assertEqual(mid["condensed_memory"], pre_turn["condensed_memory"])
            self.assertEqual(len(mid["evaluation_logs"]), 1)
            self.assertEqual(len(mid["messages"]), 1)

            second = copy.deepcopy(await mgr.submit_candidate_answer(sid, answer))
            second.pop("turn_snapshots", None)

        # 重答后决策结论与首次作答完全一致
        for field in ("round_count", "current_topic", "topic_depth", "dig_action",
                      "last_satisfaction_score", "last_answer_status",
                      "follow_up_hint", "condensed_memory"):
            self.assertEqual(second.get(field), first.get(field),
                             f"重答后 {field} 与首次作答不一致: {second.get(field)!r} != {first.get(field)!r}")
        # 观察记录一致（排除 round 无关字段），且没有残留两条对本题的评估
        self.assertEqual(first["evaluation_logs"][-1], second["evaluation_logs"][-1])
        self.assertEqual(len(second["evaluation_logs"]), 2)
        self.assertEqual(len(second["messages"]), 3)


if __name__ == "__main__":
    unittest.main()

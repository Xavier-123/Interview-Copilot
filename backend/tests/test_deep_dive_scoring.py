import json
import unittest
from unittest.mock import AsyncMock, patch
from langchain_core.messages import AIMessage
from app.agents.observer import shadow_observer_node
from app.agents.technical import technical_node
from app.agents.state import InterviewState

def create_mock_state(**kwargs) -> InterviewState:
    base: InterviewState = {
        "session_id": "test_session_001",
        "user_id": "test_user",
        "stage": "technical",
        "current_interviewer": "technical",
        "next_interviewer": "candidate",
        "round_count": 1,
        "max_rounds": 6,
        "tech_rounds_target": 5,
        "hr_rounds_target": 1,
        "stress_triggered": False,
        "current_topic": kwargs.get("current_topic", "MySQL事务与MVCC"),
        "topic_depth": kwargs.get("topic_depth", 0),
        "last_satisfaction_score": kwargs.get("last_satisfaction_score", 0.0),
        "dig_action": kwargs.get("dig_action", "INIT"),
        "candidate_profile": {"name": "张三", "skills": ["MySQL", "Redis"]},
        "jd_requirements": {"title": "后端专家"},
        "interview_mode": {"difficulty": "senior", "style": "rigorous", "language": "zh"},
        "messages": [
            {"role": "assistant", "name": "technical", "content": "请介绍MySQL事务隔离级别与MVCC原理"}
        ],
        "condensed_memory": "",
        "current_code": None,
        "code_language": "python",
        "lifelines_used": 0,
        "latest_user_input": kwargs.get("latest_user_input", "MVCC通过ReadView和UndoLog链条实现非阻塞读..."),
        "evaluation_logs": kwargs.get("evaluation_logs", []),
        "status": "in_progress"
    }
    return base

class TestDeepDiveScoring(unittest.IsolatedAsyncioTestCase):

    async def test_shadow_observer_high_score_triggers_deep_dive(self):
        """When score > 0.8 and depth < 5, observer triggers DEEP_DIVE and increments depth."""
        state = create_mock_state(topic_depth=1, dig_action="DEEP_DIVE")

        mock_llm_json = json.dumps({
            "topic": "MySQL事务与MVCC",
            "satisfaction_score": 0.88,
            "strengths": ["对ReadView分析透彻"],
            "weaknesses": [],
            "depth_score": 8.8,
            "logic_score": 8.5,
            "flags": ["solid_fundamentals"]
        })

        with patch("app.agents.observer.llm_service.invoke", new_callable=AsyncMock) as mock_invoke:
            mock_invoke.return_value = AIMessage(content=f"```json\n{mock_llm_json}\n```")
            
            result = await shadow_observer_node(state)
            
            self.assertEqual(result["last_satisfaction_score"], 0.88)
            self.assertEqual(result["topic_depth"], 2)
            self.assertEqual(result["dig_action"], "DEEP_DIVE")
            self.assertEqual(result["current_topic"], "MySQL事务与MVCC")
            self.assertEqual(len(result["evaluation_logs"]), 1)
            obs = result["evaluation_logs"][0]
            self.assertEqual(obs["satisfaction_score"], 0.88)
            self.assertEqual(obs["depth_level"], 2)

    async def test_shadow_observer_low_score_triggers_switch_topic(self):
        """When score <= 0.8, candidate struggles so observer triggers SWITCH_TOPIC."""
        state = create_mock_state(topic_depth=2, dig_action="DEEP_DIVE")

        mock_llm_json = json.dumps({
            "topic": "MySQL事务与MVCC",
            "satisfaction_score": 0.65,
            "strengths": ["了解基本概念"],
            "weaknesses": ["对底层原理含糊"],
            "depth_score": 6.5,
            "logic_score": 6.0,
            "flags": ["vague_answer"]
        })

        with patch("app.agents.observer.llm_service.invoke", new_callable=AsyncMock) as mock_invoke:
            mock_invoke.return_value = AIMessage(content=f"```json\n{mock_llm_json}\n```")
            
            result = await shadow_observer_node(state)
            
            self.assertEqual(result["last_satisfaction_score"], 0.65)
            self.assertEqual(result["topic_depth"], 1)
            self.assertEqual(result["dig_action"], "SWITCH_TOPIC")

    async def test_shadow_observer_max_5_layers_cap(self):
        """When depth has reached 5 layers, even with score > 0.8, it must trigger SWITCH_TOPIC."""
        state = create_mock_state(topic_depth=5, dig_action="DEEP_DIVE")

        mock_llm_json = json.dumps({
            "topic": "MySQL事务与MVCC",
            "satisfaction_score": 0.95,
            "strengths": ["对内核源码和锁竞争边界分析完美"],
            "weaknesses": [],
            "depth_score": 9.5,
            "logic_score": 9.5,
            "flags": ["expert_level"]
        })

        with patch("app.agents.observer.llm_service.invoke", new_callable=AsyncMock) as mock_invoke:
            mock_invoke.return_value = AIMessage(content=f"```json\n{mock_llm_json}\n```")
            
            result = await shadow_observer_node(state)
            
            self.assertEqual(result["last_satisfaction_score"], 0.95)
            # Depth capped at 5; next action must switch topic and reset depth
            self.assertEqual(result["dig_action"], "SWITCH_TOPIC")
            self.assertEqual(result["topic_depth"], 1)

    async def test_switch_topic_resets_depth_for_next_topic(self):
        """When prior action was SWITCH_TOPIC, the new round starts depth from 0 -> 1."""
        state = create_mock_state(
            current_topic="Redis分布式锁",
            topic_depth=1,
            dig_action="SWITCH_TOPIC",
            latest_user_input="Redis通过Redlock及看门狗机制实现高可用分布式锁..."
        )

        mock_llm_json = json.dumps({
            "topic": "Redis分布式锁",
            "satisfaction_score": 0.85,
            "strengths": ["正确描述了看门狗续期与红锁原理"],
            "weaknesses": [],
            "depth_score": 8.5,
            "logic_score": 8.5,
            "flags": ["good_answer"]
        })

        with patch("app.agents.observer.llm_service.invoke", new_callable=AsyncMock) as mock_invoke:
            mock_invoke.return_value = AIMessage(content=f"```json\n{mock_llm_json}\n```")
            
            result = await shadow_observer_node(state)
            
            # Started a new topic, so prior depth was reset to 0, then 0 + 1 = 1
            self.assertEqual(result["topic_depth"], 1)
            self.assertEqual(result["dig_action"], "DEEP_DIVE")
            self.assertEqual(result["current_topic"], "Redis分布式锁")

    async def test_technical_node_prompts_follow_decisions(self):
        """Verify technical_node passes deep-dive vs switch-topic instructions to LLM."""
        state_deep_dive = create_mock_state(
            topic_depth=3,
            last_satisfaction_score=0.88,
            dig_action="DEEP_DIVE",
            round_count=3
        )

        with patch("app.agents.technical.llm_service.invoke", new_callable=AsyncMock) as mock_invoke:
            mock_invoke.return_value = AIMessage(content="请进一步谈谈在极高并发下Next-Key Lock死锁的成因。")
            
            res = await technical_node(state_deep_dive)
            self.assertEqual(res["stage"], "technical")
            self.assertEqual(len(res["messages"]), 1)
            
            # Check LLM prompt contains deep dive guidance
            args = mock_invoke.call_args[0][0]
            human_msg = args[1].content
            self.assertIn("深入挖掘", human_msg)
            self.assertIn("3/5", human_msg)

if __name__ == "__main__":
    unittest.main()

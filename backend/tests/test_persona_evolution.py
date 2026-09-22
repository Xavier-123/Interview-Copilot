import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport
from langchain_core.messages import AIMessage

from app.main import app
from app.models.persona import InterviewerPersona, PersonaMemoryModel
from app.models.db import get_db
from app.services.evolution.persona_evolver import PersonaEvolver


@pytest.mark.asyncio
async def test_persona_evolver_workflow():
    """测试 PersonaEvolver 核心编排：候选人对战、Critic 诊断与优化提案生成。"""
    evolver = PersonaEvolver()
    test_persona = InterviewerPersona(
        id="test-p-1",
        key="test_architect",
        name="大模型架构师",
        avatar="🧠",
        description="专注 LLM 架构与生产级落地",
        system_prompt="你是一位资深大模型架构师，考察候选人的系统设计能力。",
        focus_topics=["LLM 高并发推理架构", "投机采样与显存优化"],
        skepticism_level=0.5,
    )

    mock_q1 = AIMessage(content="你好，请介绍一下你在千万级高并发下是如何做 LLM 推理加速与显存优化的？")
    mock_ans1 = "我们主要通过 vLLM 的 PagedAttention 以及动态批处理来降低显存碎片并提升吞吐。"
    mock_q2 = AIMessage(content="针对你提到的动态批处理，当遇到超长 Prompt 请求和突发倾斜时，排队调度策略是怎样的？")
    mock_ans2 = "我们使用了按 chunk 分块 prefill 的优先级调度，避免长序列饥饿。"

    mock_synthesis_json = """{
        "optimized_system_prompt": "你是一位极其严苛的资深大模型架构专家。绝不客套，直奔架构瓶颈与故障降级方案，强力追问真实生产边界。",
        "negative_rules": [
            "严禁使用'好的'、'很清晰'等口癖开场，直戳候选人方案漏洞。",
            "若候选人提到主流框架特性，必须追问非正常边界与极限吞吐。"
        ],
        "golden_few_shots": [
            "当系统突发 10x 流量冲击且 GPU 显存打满时，你们的降级旁路与排队熔断指标是什么？"
        ],
        "suggested_skepticism_level": 0.7,
        "optimized_deep_dive_hint": "针对其系统设计的调度边界与容灾方案进行深入拷问。",
        "optimized_probe_hint": "对其模糊的工程选型提出具体对比质疑。",
        "optimization_rationale": "优化了提问锐度，增加了对架构高可用极限指标的穿透追问。"
    }"""

    with patch("app.services.evolution.persona_evolver.llm_service.invoke", new_callable=AsyncMock) as mock_llm, \
         patch("app.services.evolution.persona_evolver.synthetic_candidate_agent.generate_answer", new_callable=AsyncMock) as mock_cand, \
         patch("app.services.evolution.persona_evolver.critic_agent.diagnose", new_callable=AsyncMock) as mock_critic:

        mock_llm.side_effect = [mock_q1, mock_q2, AIMessage(content=mock_synthesis_json)]
        mock_cand.side_effect = [mock_ans1, mock_ans2]
        mock_critic.return_value = {
            "critique_score": 7.5,
            "defects": [
                {
                    "round": 1,
                    "description": "开场提问偏宏观，容易被候选人八股应对",
                    "suggestion": "直接给出具体业务场景上下文",
                    "severity": "medium",
                }
            ],
            "overall_evaluation": "整体表现尚可，但穿透力可以进一步加强",
        }

        result = await evolver.run_persona_evolution(
            persona=test_persona,
            target_topic="LLM 高并发推理架构",
            candidate_behavior="vague",
        )

        assert result["persona_id"] == "test-p-1"
        assert result["persona_name"] == "大模型架构师"
        assert len(result["simulation_transcript"]) == 4
        assert result["critic_report"]["critique_score"] == 7.5
        assert len(result["optimized_spec"]["negative_rules"]) == 2
        assert len(result["optimized_spec"]["golden_few_shots"]) == 1
        assert result["optimized_spec"]["skepticism_level"] == 0.7
        assert "极其严苛" in result["optimized_spec"]["system_prompt"]


@pytest.mark.asyncio
async def test_persona_evolution_api_endpoints():
    """测试 auto-evolve 和 apply-evolution API 接口及数据库更新与记忆沉淀。"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. 创建测试角色
        create_res = await client.post("/api/v1/personas", json={
            "name": "待进化技术总监",
            "avatar": "⚡",
            "description": "初始测试角色",
            "system_prompt": "你是一位技术总监，负责面试架构师。",
            "focus_topics": ["分布式事务", "高可用容灾"],
            "opening_hint": "请候选人介绍经历",
            "deep_dive_hint": "继续深入",
            "probe_hint": "引导回答",
            "switch_hint": "切换主题",
        })
        assert create_res.status_code == 200
        persona_data = create_res.json()["persona"]
        persona_id = persona_data["id"]

        # 2. 模拟 auto-evolve 接口
        mock_evolution_result = {
            "persona_id": persona_id,
            "persona_name": "待进化技术总监",
            "topic": "分布式事务",
            "simulation_transcript": [
                {"round": 1, "speaker": "interviewer", "role": "assistant", "name": "待进化技术总监", "content": "分布式事务怎么做？"},
                {"round": 1, "speaker": "candidate", "role": "user", "name": "合成候选人", "content": "用 2PC 或 TCC。"},
            ],
            "critic_report": {"critique_score": 7.0, "defects": []},
            "original_spec": {
                "name": "待进化技术总监",
                "avatar": "⚡",
                "description": "初始测试角色",
                "system_prompt": "你是一位技术总监，负责面试架构师。",
                "skepticism_level": 0.5,
                "focus_topics": ["分布式事务"],
            },
            "optimized_spec": {
                "system_prompt": "【进化版】你是一位严厉务实的技术总监，重点深挖分布式事务脑裂与补偿幂等。",
                "negative_rules": ["严禁空泛讨论理论，必须追问两阶段提交第一阶段超时的业务补偿方案。"],
                "golden_few_shots": ["若协调者与参与者同时宕机，网络恢复后如何保证数据最终一致？"],
                "skepticism_level": 0.75,
                "deep_dive_hint": "追问宕机超时细节",
                "probe_hint": "追问幂等设计",
                "optimization_rationale": "增强容灾与极端异常追问",
            },
        }

        with patch("app.api.v1.personas.persona_evolver.run_persona_evolution", new_callable=AsyncMock) as mock_evolve:
            mock_evolve.return_value = mock_evolution_result

            evolve_res = await client.post(f"/api/v1/personas/{persona_id}/auto-evolve", json={
                "candidate_behavior": "vague"
            })
            assert evolve_res.status_code == 200
            assert evolve_res.json()["data"]["optimized_spec"]["skepticism_level"] == 0.75

        # 3. 测试 apply-evolution (覆盖模式 overwrite)
        apply_res = await client.post(f"/api/v1/personas/{persona_id}/apply-evolution", json={
            "apply_mode": "overwrite",
            "optimized_system_prompt": mock_evolution_result["optimized_spec"]["system_prompt"],
            "skepticism_level": 0.75,
            "negative_rules": mock_evolution_result["optimized_spec"]["negative_rules"],
            "golden_few_shots": mock_evolution_result["optimized_spec"]["golden_few_shots"],
        })
        assert apply_res.status_code == 200
        updated_persona = apply_res.json()["persona"]
        assert "【进化版】" in updated_persona["system_prompt"]
        assert updated_persona["skepticism_level"] == 0.75

        # 4. 测试 apply-evolution (另存为新版本 save_as_new)
        save_as_new_res = await client.post(f"/api/v1/personas/{persona_id}/apply-evolution", json={
            "apply_mode": "save_as_new",
            "new_name": "待进化技术总监 (V2 Pro)",
            "optimized_system_prompt": "【V2 Pro】究极进化版本",
            "skepticism_level": 0.85,
            "negative_rules": ["V2 专属规则：严禁脱离代码细节谈架构。"],
            "golden_few_shots": ["请手写一段无锁并发队列伪代码。"],
        })
        assert save_as_new_res.status_code == 200
        new_persona = save_as_new_res.json()["persona"]
        assert new_persona["name"] == "待进化技术总监 (V2 Pro)"
        assert new_persona["id"] != persona_id
        assert new_persona["skepticism_level"] == 0.85

        # 5. 清理测试产生的角色
        await client.delete(f"/api/v1/personas/{persona_id}")
        await client.delete(f"/api/v1/personas/{new_persona['id']}")

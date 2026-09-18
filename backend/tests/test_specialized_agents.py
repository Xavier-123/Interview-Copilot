import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.db import init_db
from app.services.scenario_service import scenario_service
from app.services.rag import rag_service
from app.services.audit import audit_service
from app.agents.persona_presets import PERSONA_PRESETS
from app.agents import interviewer_utils
from app.agents.state import InterviewState

@pytest.mark.asyncio
async def test_persona_presets_and_matrix_fields():
    await init_db()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Test GET /api/v1/personas/presets
        resp = await client.get("/api/v1/personas/presets")
        assert resp.status_code == 200
        data = resp.json()
        assert "presets" in data
        presets = data["presets"]
        assert len(presets) >= 4

        keys = [p["key"] for p in presets]
        assert "preset_troubleshooter" in keys
        assert "preset_deep_source" in keys
        assert "preset_business_roi" in keys
        assert "preset_anti_cheat" in keys

        troubleshooter = next(p for p in presets if p["key"] == "preset_troubleshooter")
        assert troubleshooter["school_of_thought"] == "incident_first"
        assert len(troubleshooter["dislikes"]) > 0
        assert len(troubleshooter["preferences"]) > 0
        assert troubleshooter["skepticism_level"] >= 0.8
        assert "style_prompt" in troubleshooter["interaction_traits"]


@pytest.mark.asyncio
async def test_company_scenarios_and_injection():
    await init_db()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Test GET /api/v1/interviews/scenarios
        resp = await client.get("/api/v1/interviews/scenarios")
        assert resp.status_code == 200
        scenarios = resp.json()["scenarios"]
        assert len(scenarios) >= 5
        companies = [s["company"] for s in scenarios]
        assert "美团" in companies
        assert "字节跳动" in companies
        assert "拼多多" in companies

        # Test scenario matching
        matched_meituan = scenario_service.match_scenario(company="美团外卖", job_role="后端架构师")
        assert matched_meituan is not None
        assert matched_meituan["company"] == "美团"

        matched_bytedance = scenario_service.match_scenario(company="字节", job_role="推荐算法")
        assert matched_bytedance is not None
        assert matched_bytedance["company"] == "字节跳动"

        # Test creating session with scenario
        sess_resp = await client.post("/api/v1/interviews/session", json={
            "resume_text": "资深后端开发，精通高并发与分布式系统",
            "interview_type": "technical",
            "company_scenario": matched_meituan
        })
        assert sess_resp.status_code == 200
        sess_data = sess_resp.json()
        assert sess_data["company_scenario"] is not None
        assert sess_data["company_scenario"]["company"] == "美团"


@pytest.mark.asyncio
async def test_question_bank_rag_service():
    # Test RAG retrieval with query and company filter
    res = rag_service.retrieve_question_angles(query="Redis分布式锁超时与看门狗", company="字节", top_k=2)
    assert len(res) >= 1
    top_item = res[0]
    assert "Redis" in top_item["topic"] or "redis" in top_item["tags"]
    assert len(top_item["probing_traps"]) > 0
    assert "authentic_question" in top_item


@pytest.mark.asyncio
async def test_anti_memorization_and_break_routine():
    # Test interviewer_utils instruction generation for BREAK_ROUTINE
    dummy_state: InterviewState = {
        "session_id": "test_break_routine",
        "user_id": "test_user",
        "title": "测试面试",
        "stage": "technical",
        "current_interviewer": "technical",
        "next_interviewer": "candidate",
        "interview_type": "technical",
        "industry": "互联网",
        "job_role": "后端开发",
        "seniority": "senior",
        "difficulty": "hard",
        "style": "rigorous",
        "language": "zh",
        "custom_config": None,
        "company_scenario": {
            "company": "美团",
            "business_domain": "即时配送",
            "core_challenges": ["弱网断网状态同步"],
            "sla_constraints": "P99 < 800ms"
        },
        "web_search_enabled": False,
        "round_count": 2,
        "max_rounds": 6,
        "tech_rounds_target": 3,
        "hr_rounds_target": 1,
        "mgmt_rounds_target": 2,
        "stress_triggered": False,
        "current_topic": "Redis分布式锁",
        "topic_depth": 2,
        "last_satisfaction_score": 0.82,
        "last_answer_status": "solid",
        "dig_action": "BREAK_ROUTINE",
        "switch_reason": None,
        "next_topic_hint": None,
        "follow_up_hint": "假定线上Full GC停顿40秒导致锁超时丢失",
        "break_routine_hint": "推翻Redlock假设：若发生长达40秒的Full GC，如何防止并发脏写？",
        "candidate_profile": {},
        "jd_requirements": {},
        "interview_mode": {"language": "zh"},
        "messages": [],
        "condensed_memory": "",
        "current_code": None,
        "code_language": "python",
        "lifelines_used": 0,
        "latest_user_input": "我们通过Redisson看门狗机制，默认30秒租期，每10秒自动续期，完美避免了死锁和超时。",
        "evaluation_logs": [],
        "status": "in_progress"
    }

    # Test company_scenario_prompt_section
    scenario_prompt = interviewer_utils.company_scenario_prompt_section(dummy_state)
    assert "美团" in scenario_prompt
    assert "弱网断网状态同步" in scenario_prompt

    # Test build_break_routine_instruction
    instruction = interviewer_utils.build_break_routine_instruction(
        dummy_state,
        "请抛出一个突发线上故障。"
    )
    assert "【系统决策：反套路突击 (Break Routine)】" in instruction
    assert "推翻Redlock假设" in instruction


@pytest.mark.asyncio
async def test_interviewer_audit_and_self_evolution_engine():
    await init_db()
    # Test mock session state for audit
    dummy_state: InterviewState = {
        "session_id": "test_audit_session",
        "user_id": "test_user",
        "title": "测试审核面试",
        "stage": "technical",
        "current_interviewer": "preset_troubleshooter",
        "next_interviewer": "candidate",
        "interview_type": "technical",
        "industry": "互联网",
        "job_role": "SRE架构师",
        "seniority": "senior",
        "difficulty": "hard",
        "style": "rigorous",
        "language": "zh",
        "custom_config": None,
        "company_scenario": None,
        "web_search_enabled": False,
        "round_count": 3,
        "max_rounds": 6,
        "tech_rounds_target": 3,
        "hr_rounds_target": 1,
        "mgmt_rounds_target": 2,
        "stress_triggered": False,
        "current_topic": "生产事故定位与CPU100%",
        "topic_depth": 2,
        "last_satisfaction_score": 0.85,
        "last_answer_status": "solid",
        "dig_action": "DEEP_DIVE",
        "switch_reason": None,
        "next_topic_hint": None,
        "follow_up_hint": None,
        "break_routine_hint": None,
        "candidate_profile": {"skills": ["Linux", "JVM", "MySQL"]},
        "jd_requirements": {"title": "SRE专家"},
        "interview_mode": {"language": "zh"},
        "messages": [
            {"role": "assistant", "name": "preset_troubleshooter", "content": "如果线上 CPU 瞬间飙升到 100%，报警群炸裂，你的第一步排查命令和指标是什么？"},
            {"role": "user", "name": "candidate", "content": "我会先用 top -H 定位到占用 CPU 最高的线程 ID，转为十六进制后用 jstack 抓取堆栈分析。"}
        ],
        "condensed_memory": "已考察CPU100%排查",
        "current_code": None,
        "code_language": "python",
        "lifelines_used": 0,
        "latest_user_input": "我会先用 top -H 定位到占用 CPU 最高的线程 ID",
        "evaluation_logs": [
            {"round_index": 1, "topic": "CPU100%排查", "satisfaction_score": 0.85, "is_memorized": False}
        ],
        "status": "finished"
    }

    # Execute audit
    audit_res = await audit_service.audit_session(dummy_state)
    assert "overall_score" in audit_res
    assert "golden_trajectories" in audit_res
    assert "negative_rules" in audit_res

    # Test reading persisted memories back
    memories = await audit_service.get_persona_evolution_memories("preset_troubleshooter")
    assert isinstance(memories.get("golden_few_shots"), list)
    assert isinstance(memories.get("negative_rules"), list)


@pytest.mark.asyncio
async def test_granular_multi_interviewer_attribution_and_resolution():
    """测试方案二：多人出场下的确定性角色反查与逐角色经验精准归因。"""
    await init_db()
    from app.services.audit import _resolve_interviewer_role

    assistant_messages = [
        {"role": "assistant", "name": "preset_troubleshooter", "content": "线上Full GC发生40秒停顿，看门狗续期失效，如何用Fencing Token兜底？"},
        {"role": "assistant", "name": "hr", "content": "请结合一次线上重大故障，谈谈你如何与跨部门团队协同复盘并推进落地改进？"}
    ]
    valid_keys = ["preset_troubleshooter", "hr"]
    key_to_name = {
        "preset_troubleshooter": "线上排障老炮·老赵",
        "hr": "HR面试官"
    }

    # 1. 验证精确 key 命中
    role1 = _resolve_interviewer_role("preset_troubleshooter", "", assistant_messages, valid_keys, key_to_name, "technical")
    assert role1 == "preset_troubleshooter"

    # 2. 验证别名/显示名纠偏
    role2 = _resolve_interviewer_role("线上排障老炮·老赵", "", assistant_messages, valid_keys, key_to_name, "technical")
    assert role2 == "preset_troubleshooter"
    role3 = _resolve_interviewer_role("HR面试官", "", assistant_messages, valid_keys, key_to_name, "technical")
    assert role3 == "hr"

    # 3. 验证当大模型输出幻觉/错误 key 时，通过提问文本在消息中确定性反查
    role4 = _resolve_interviewer_role(
        "hallucinated_interviewer_99",
        "线上Full GC发生40秒停顿，看门狗续期失效",
        assistant_messages,
        valid_keys,
        key_to_name,
        "technical"
    )
    assert role4 == "preset_troubleshooter"

    role5 = _resolve_interviewer_role(
        None,
        "请结合一次线上重大故障，谈谈你如何与跨部门团队协同复盘",
        assistant_messages,
        valid_keys,
        key_to_name,
        "technical"
    )
    assert role5 == "hr"

    # 4. 测试持久化时多角色精准分发，绝不串味
    audit_data = {
        "overall_score": 9.2,
        "golden_trajectories": [
            {
                "interviewer_role": "线上排障老炮·老赵",
                "topic": "Redis分布式锁STW与Fencing Token",
                "good_question": "线上Full GC发生40秒停顿，看门狗续期失效，如何用Fencing Token兜底？",
                "why_effective": "直击分布式锁在极端STW下的安全性硬伤"
            },
            {
                "interviewer_role": "hr",
                "topic": "跨部门协作与事故复盘",
                "good_question": "请结合一次线上重大故障，谈谈你如何与跨部门团队协同复盘并推进落地改进？",
                "why_effective": "有效考察面对高压事故时的组织韧性与复盘推进力"
            }
        ],
        "negative_rules": [
            {
                "interviewer_role": "preset_troubleshooter",
                "rule": "针对系统故障提问必须包含清晰的指标排查路径"
            },
            {
                "interviewer_role": "hr",
                "rule": "考察协作能力时避免问出空泛的假设性套话"
            }
        ]
    }

    await audit_service._persist_audit_evolution(
        audit_result=audit_data,
        assistant_messages=assistant_messages,
        valid_keys=valid_keys,
        key_to_name=key_to_name,
        default_role="technical",
        is_fallback=False
    )

    # 5. 读取老赵的经验库：必须包含分布式锁追问，严禁包含 HR 协作题目
    troubleshooter_mems = await audit_service.get_persona_evolution_memories("preset_troubleshooter")
    assert any("Fencing Token" in g for g in troubleshooter_mems["golden_few_shots"])
    assert not any("跨部门团队协同" in g for g in troubleshooter_mems["golden_few_shots"])
    assert any("清晰的指标排查路径" in r for r in troubleshooter_mems["negative_rules"])

    # 6. 读取 HR 的经验库：必须包含团队协作题目，严禁包含分布式锁追问
    hr_mems = await audit_service.get_persona_evolution_memories("hr")
    assert any("跨部门团队协同" in g for g in hr_mems["golden_few_shots"])
    assert not any("Fencing Token" in g for g in hr_mems["golden_few_shots"])
    assert any("避免问出空泛的假设性套话" in r for r in hr_mems["negative_rules"])


@pytest.mark.asyncio
async def test_fallback_audit_does_not_pollute_db():
    """测试防御机制：Fallback 异常兜底结果绝对不写入经验库，杜绝硬编码脏数据。"""
    await init_db()

    dummy_fallback_data = {
        "overall_score": 8.0,
        "golden_trajectories": [
            {
                "interviewer_role": "persona_clean_test",
                "topic": "分布式系统实践",
                "good_question": "结合实际业务场景追问了系统极限并发与极端异常兜底方案",
                "why_effective": "有效激发了候选人的深度技术推演与架构权衡思考"
            }
        ],
        "negative_rules": [
            {
                "interviewer_role": "persona_clean_test",
                "rule": "严禁连续多轮停留在框架基础配置与纯概念释义上"
            }
        ]
    }

    # 执行 fallback 持久化 (is_fallback=True)
    await audit_service._persist_audit_evolution(
        audit_result=dummy_fallback_data,
        assistant_messages=[],
        valid_keys=["persona_clean_test"],
        key_to_name={},
        default_role="persona_clean_test",
        is_fallback=True
    )

    # 验证数据库中绝对没有写入任何脏数据
    clean_mems = await audit_service.get_persona_evolution_memories("persona_clean_test")
    assert len(clean_mems["golden_few_shots"]) == 0
    assert len(clean_mems["negative_rules"]) == 0


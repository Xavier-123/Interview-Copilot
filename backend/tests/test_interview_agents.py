import pytest
from app.services.session_manager import session_manager
from app.services.parser import parser_service

@pytest.mark.asyncio
async def test_parser_service():
    sample_resume = """
    张三，4年后端开发经验。
    核心技能：Python, FastAPI, Redis, MySQL, Kafka, Docker
    项目经历：
    1. 高并发电商秒杀系统：负责订单流控与缓存架构，单机QPS从1000提升至8000。
    2. 分布式对账中台：利用 Canal 增量同步 MySQL Binlog，解决跨库一致性。
    """
    profile = await parser_service.parse_resume(sample_resume)
    assert profile is not None
    assert "skills" in profile
    assert len(profile["skills"]) > 0

    sample_jd = """
    资深后端架构师
    岗位要求：
    1. 熟练掌握 Python 或 Go，深入理解微服务与分布式设计
    2. 具备分布式缓存、高可用、高并发容灾实战经验
    3. 良好的团队协作与抗压能力
    """
    jd_reqs = await parser_service.parse_jd(sample_jd)
    assert jd_reqs is not None
    assert "required_skills" in jd_reqs

@pytest.mark.asyncio
async def test_interview_full_lifecycle():
    # 1. Create Session
    state = await session_manager.create_session(
        resume_text="张三，后端研发，精通 Python 和 Redis",
        jd_text="高级后端工程师，要求掌握分布式架构",
        difficulty="senior",
        style="rigorous",
        language="zh"
    )
    session_id = state["session_id"]
    assert state["stage"] == "icebreak"
    assert state["status"] == "ready"

    # 2. Start Interview (Orchestrator Icebreak)
    start_state = await session_manager.start_session(session_id)
    assert start_state["stage"] == "self_intro"
    assert start_state["status"] == "waiting_user"
    assert len(start_state["messages"]) >= 1
    assert start_state["messages"][-1]["name"] == "orchestrator"

    # 3. Candidate Self Intro -> Transitions to Technical
    intro_resp = await session_manager.submit_candidate_answer(
        session_id,
        "面试官您好，我叫张三，有4年高并发后端开发经验，曾主导过分布式秒杀系统的重构与性能调优。"
    )
    assert intro_resp["stage"] == "technical"
    assert intro_resp["current_interviewer"] == "technical"
    assert intro_resp["status"] == "waiting_user"

    # 4. Candidate Answers Technical Question 1
    tech1_resp = await session_manager.submit_candidate_answer(
        session_id,
        "我们通过在 Redis 前置加互斥锁，配合逻辑过期时间解决缓存击穿；对于一致性，采用 Canal 异步消费 Binlog 延迟双删保证最终一致。"
    )
    # Check that shadow observer recorded observation
    assert len(tech1_resp["evaluation_logs"]) >= 1
    assert tech1_resp["evaluation_logs"][-1]["depth_score"] > 0
    assert len(tech1_resp["evaluation_logs"][-1]["strengths"]) > 0

    # 5. Candidate Answers Technical Question 2 -> Should transition to HR
    tech2_resp = await session_manager.submit_candidate_answer(
        session_id,
        "在极端流量突增时，我们部署了 Sentinel 进行热点参数限流，同时开启服务降级，保证核心履约链路可用。"
    )
    assert len(tech2_resp["evaluation_logs"]) >= 2
    assert tech2_resp["stage"] in ("hr", "transition_to_hr")

    # 6. Candidate Answers HR Question -> Should transition to Candidate Q&A
    hr_resp = await session_manager.submit_candidate_answer(
        session_id,
        "当时距离大促只有3天，产品临时调整了营销规则。我拉齐了测试和运维，按优先级梳理最小可行集，最终按时高质上线。"
    )
    assert len(hr_resp["evaluation_logs"]) >= 3
    assert hr_resp["stage"] in ("candidate_qa", "conclusion")

    # 7. Lifeline test
    lifeline_result = await session_manager.request_lifeline(session_id)
    assert "hint" in lifeline_result
    assert lifeline_result["lifelines_used"] == 1

    # 8. Finish & Evaluate
    report = await session_manager.finish_and_evaluate(session_id)
    assert "radar_scores" in report
    assert "technical_depth" in report["radar_scores"]
    assert "detailed_reviews" in report
    assert len(report["detailed_reviews"]) > 0
    assert "learning_plan" in report

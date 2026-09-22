import os
import json
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.services.session_manager import session_manager
from app.services.prompt_recorder import prompt_recorder
from app.models.db import AsyncSessionLocal
from app.models.interview import InterviewPromptLogModel
from sqlalchemy import select


@pytest.mark.asyncio
async def test_prompt_recorder_unit():
    """Test unit functions of prompt_recorder service."""
    log_item = prompt_recorder.build_prompt_log(
        session_id="test_sess_123",
        node="orchestrator",
        call_type="interviewer_question",
        system_prompt="You are a helpful interviewer.",
        user_prompt="Candidate just joined. Greet them.",
        response="Hello! Welcome to the interview.",
        stage="icebreak",
        model="deepseek-v3",
        metadata={"round": 1},
    )

    assert log_item["id"] is not None
    assert log_item["node"] == "orchestrator"
    assert log_item["call_type"] == "interviewer_question"
    assert log_item["system_prompt"] == "You are a helpful interviewer."
    assert log_item["user_prompt"] == "Candidate just joined. Greet them."
    assert log_item["response"] == "Hello! Welcome to the interview."
    assert log_item["metadata"]["round"] == 1

    session_meta = {"id": "test_sess_123", "title": "测试面试会话"}
    md_content = prompt_recorder.render_full_prompts_markdown(
        session_meta=session_meta,
        prompt_logs=[log_item],
    )
    assert "# 模拟面试全链路大模型 Prompt 完整实录" in md_content
    assert "test_sess_123" in md_content
    assert "You are a helpful interviewer." in md_content
    assert "Candidate just joined. Greet them." in md_content
    assert "Hello! Welcome to the interview." in md_content

    json_str = prompt_recorder.render_full_prompts_json(
        session_meta=session_meta,
        prompt_logs=[log_item],
    )
    parsed = json.loads(json_str)
    assert isinstance(parsed, dict)
    assert parsed["total_prompt_calls"] == 1
    assert len(parsed["prompt_logs"]) == 1
    assert parsed["prompt_logs"][0]["id"] == log_item["id"]

    saved_paths = prompt_recorder.save_prompts_to_disk("test_disk_session", session_meta, [log_item])
    assert "markdown" in saved_paths
    assert "json" in saved_paths
    assert os.path.exists(saved_paths["markdown"])
    assert os.path.exists(saved_paths["json"])

    # Clean up test files
    try:
        os.remove(saved_paths["markdown"])
        os.remove(saved_paths["json"])
    except OSError:
        pass


@pytest.mark.asyncio
async def test_session_prompt_recording_and_association():
    """Test end-to-end prompt recording, state accumulation, and DB persistence."""
    # 1. Create session
    state = await session_manager.create_session(
        resume_text="李四，精通 Python, 微服务，高并发架构",
        jd_text="资深后端工程师，具备高并发经验",
        difficulty="senior",
        style="rigorous",
        language="zh",
    )
    session_id = state["session_id"]
    assert "prompt_logs" in state
    assert len(state["prompt_logs"]) == 0

    # 2. Start session (orchestrator generates opening message)
    start_state = await session_manager.start_session(session_id)
    assert len(start_state["prompt_logs"]) >= 1
    first_log = start_state["prompt_logs"][0]
    assert "orchestrator" in first_log["node"]
    assert first_log["system_prompt"] != ""
    assert first_log["user_prompt"] != ""

    # Check that the generated assistant message has prompt_log_id pointing to this log
    assistant_msgs = [m for m in start_state["messages"] if m.get("role") == "assistant"]
    assert len(assistant_msgs) >= 1
    assert assistant_msgs[-1].get("prompt_log_id") == first_log["id"]

    # 3. Candidate answers self introduction -> triggers transition to technical interviewer
    ans_state = await session_manager.submit_candidate_answer(
        session_id,
        "各位面试官好，我是李四，拥有5年后端分布式开发实战经验，曾负责核心网关的高可用与流控设计。",
    )
    assert len(ans_state["prompt_logs"]) >= 2
    second_log = ans_state["prompt_logs"][-1]
    assert second_log["system_prompt"] != ""
    assert second_log["user_prompt"] != ""

    # Check the latest assistant message
    latest_msg = ans_state["messages"][-1]
    assert latest_msg["role"] == "assistant"
    assert latest_msg.get("prompt_log_id") == second_log["id"]

    # 4. Verify SQLite DB persistence
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(InterviewPromptLogModel)
            .where(InterviewPromptLogModel.session_id == session_id)
            .order_by(InterviewPromptLogModel.created_at.asc())
        )
        db_logs = result.scalars().all()
        assert len(db_logs) >= 2
        assert db_logs[0].id == first_log["id"]
        assert db_logs[0].system_prompt == first_log["system_prompt"]
        assert db_logs[0].user_prompt == first_log["user_prompt"]

    # 5. Verify session_manager.get_transcript
    transcript = await session_manager.get_transcript(session_id)
    assert "prompt_logs" in transcript
    assert len(transcript["prompt_logs"]) >= 2
    # Check messages in transcript carry prompt_log_id
    t_assistant_msgs = [m for m in transcript["messages"] if m.get("role") == "assistant"]
    assert any(m.get("prompt_log_id") is not None for m in t_assistant_msgs)


@pytest.mark.asyncio
async def test_prompt_api_endpoints():
    """Test the HTTP API endpoints for prompt retrieval and exports."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Create session
        res = await client.post("/api/v1/interviews/session", json={
            "resume_text": "王五，测试开发工程师",
            "jd_text": "高级QA测试专家",
            "difficulty": "mid",
            "style": "friendly",
            "language": "zh",
        })
        assert res.status_code == 200
        session_id = res.json()["session_id"]

        # 2. Start session
        res_start = await client.post(f"/api/v1/interviews/{session_id}/start")
        assert res_start.status_code == 200

        # 3. Test GET /{session_id}/prompts
        res_prompts = await client.get(f"/api/v1/interviews/{session_id}/prompts")
        assert res_prompts.status_code == 200
        prompts_data = res_prompts.json()
        assert prompts_data["session_id"] == session_id
        assert prompts_data["total_calls"] >= 1
        assert len(prompts_data["prompt_logs"]) >= 1

        # 4. Test GET /{session_id}/export?format=prompts_markdown
        res_export_md = await client.get(f"/api/v1/interviews/{session_id}/export?format=prompts_markdown")
        assert res_export_md.status_code == 200
        assert "text/markdown" in res_export_md.headers.get("content-type", "")
        assert "# 模拟面试全链路大模型 Prompt 完整实录" in res_export_md.text

        # 5. Test GET /{session_id}/export?format=prompts_json
        res_export_json = await client.get(f"/api/v1/interviews/{session_id}/export?format=prompts_json")
        assert res_export_json.status_code == 200
        assert "application/json" in res_export_json.headers.get("content-type", "")
        exported_data = res_export_json.json()
        assert isinstance(exported_data, dict)
        assert exported_data["total_prompt_calls"] >= 1
        assert len(exported_data["prompt_logs"]) >= 1
        assert "system_prompt" in exported_data["prompt_logs"][0]
        assert "user_prompt" in exported_data["prompt_logs"][0]

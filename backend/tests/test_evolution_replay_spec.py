from unittest.mock import AsyncMock, patch

import pytest
from langchain_core.messages import AIMessage

from app.services.evolution.replay_runner import replay_runner


@pytest.mark.asyncio
async def test_replay_uses_compiled_candidate_prompt():
    spec = {"compiled_system_prompt": "你是经过验证的面试官", "interviewer_id": "technical"}
    with patch("app.services.evolution.replay_runner.llm_service.invoke", new_callable=AsyncMock) as invoke:
        invoke.return_value = AIMessage(content="请解释你的架构取舍。")
        question = await replay_runner._simulate_interviewer_turn(
            spec=spec,
            topic="架构设计",
            question="起始题",
            turn_idx=0,
            transcript=[],
        )

    assert question == "请解释你的架构取舍。"
    assert invoke.await_args.args[0][0].content == spec["compiled_system_prompt"]

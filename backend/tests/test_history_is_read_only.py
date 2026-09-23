import pytest

from app.models.db import AsyncSessionLocal, init_db
from app.models.interview import InterviewSessionModel
from app.services.session_manager import SessionManager


@pytest.mark.asyncio
async def test_history_query_does_not_delete_short_active_session():
    await init_db()
    manager = SessionManager()
    state = await manager.create_session(resume_text="候选人", jd_text="岗位")
    session_id = state["session_id"]
    state["status"] = "in_progress"
    state["round_count"] = 1
    await manager._sync_state_to_db(session_id, state)

    await manager.get_history()

    async with AsyncSessionLocal() as db:
        assert await db.get(InterviewSessionModel, session_id) is not None

    assert await manager.delete_session(session_id)


@pytest.mark.asyncio
async def test_start_session_is_idempotent():
    await init_db()
    manager = SessionManager()
    state = await manager.create_session(resume_text="候选人", jd_text="岗位")
    session_id = state["session_id"]

    first = await manager.start_session(session_id)
    second = await manager.start_session(session_id)

    assert second["messages"] == first["messages"]
    assert second["round_count"] == first["round_count"]
    assert await manager.delete_session(session_id)

"""会话删除与自动清理必须同步清掉 evidence_items 记忆证据的回归测试。

背景：evidence_items 与 interview_sessions 无外键关联（SQLite 默认不启用外键），
历史版本删除会话时遗漏该表，导致已删除会话的影子观察员评估记录永久残留。
"""
import uuid
import pytest

from app.models.db import AsyncSessionLocal, init_db
from app.models.architecture import EvidenceItemModel
from app.services.session_manager import SessionManager


async def _make_session(mgr: SessionManager, rounds: int) -> str:
    state = await mgr.create_session(resume_text="t", jd_text="t", job_role="证据清理测试")
    sid = state["session_id"]
    state["round_count"] = rounds
    await mgr._sync_state_to_db(sid, state)
    return sid


async def _add_evidence(session_id: str) -> str:
    eid = str(uuid.uuid4())
    async with AsyncSessionLocal() as db:
        db.add(EvidenceItemModel(
            id=eid,
            session_id=session_id,
            turn_id="turn-1",
            topic="tech",
            payload={"observation": "test"},
            source="test",
        ))
        await db.commit()
    return eid


async def _evidence_exists(eid: str) -> bool:
    async with AsyncSessionLocal() as db:
        return (await db.get(EvidenceItemModel, eid)) is not None


@pytest.mark.asyncio
async def test_delete_session_removes_evidence():
    await init_db()
    mgr = SessionManager()
    sid = await _make_session(mgr, 3)
    eid = await _add_evidence(sid)

    assert await _evidence_exists(eid), "前置条件：证据已写入"
    assert await mgr.delete_session(sid) is True
    assert not await _evidence_exists(eid), "单条删除会话时应同步删除 evidence_items 记忆证据"


@pytest.mark.asyncio
async def test_batch_delete_removes_evidence():
    await init_db()
    mgr = SessionManager()
    sid1 = await _make_session(mgr, 3)
    sid2 = await _make_session(mgr, 4)
    eid1 = await _add_evidence(sid1)
    eid2 = await _add_evidence(sid2)

    deleted = await mgr.delete_sessions([sid1, sid2])
    assert deleted == 2
    assert not await _evidence_exists(eid1), "批量删除时应同步删除 evidence_items 记忆证据"
    assert not await _evidence_exists(eid2), "批量删除时应同步删除 evidence_items 记忆证据"


@pytest.mark.asyncio
async def test_cleanup_incomplete_sessions_removes_orphaned_evidence():
    await init_db()
    mgr = SessionManager()

    # 孤立证据：session_id 对应的会话已不存在（历史版本删除遗漏的存量形态）
    orphan_eid = str(uuid.uuid4())
    orphan_sid = "gone-session-" + uuid.uuid4().hex[:8]
    async with AsyncSessionLocal() as db:
        db.add(EvidenceItemModel(
            id=orphan_eid,
            session_id=orphan_sid,
            payload={"observation": "orphan"},
        ))
        await db.commit()

    assert await _evidence_exists(orphan_eid), "前置条件：孤立证据已写入"
    await mgr.cleanup_incomplete_sessions(min_rounds=3)
    assert not await _evidence_exists(orphan_eid), "自动清理应顺带删除不属于任何有效会话的孤立证据"

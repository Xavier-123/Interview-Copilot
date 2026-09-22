import asyncio
import os
import uuid
from datetime import datetime, timedelta
import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.models.db import AsyncSessionLocal, init_db
from app.models.interview import InterviewSessionModel
from app.services.session_manager import session_manager, MIN_PERSIST_ROUNDS
from app.services.prompt_recorder import TRANSCRIPTS_DIR
from app.services.cleanup_worker import (
    run_periodic_cleanup,
    cleanup_scheduler_loop,
    DEFAULT_CLEANUP_INTERVAL_SECONDS,
    DEFAULT_IDLE_THRESHOLD_MINUTES,
)


@pytest.mark.asyncio
async def test_cleanup_worker_ttl_protection():
    """
    测试定时任务在空闲保护窗口（TTL）下的行为：
    1. 刚创建不久的会话（created_at < 60分钟前，round_count < 3）处于面试活跃中，应当被保护，不被误删。
    2. 很久以前创建的废弃会话（created_at > 60分钟前，round_count < 3）应当被自动清理，包括数据库及磁盘镜像。
    3. 正常完成/达标的会话（round_count >= 3）无论时间多久都应当持久化保留。
    """
    await init_db()
    os.makedirs(TRANSCRIPTS_DIR, exist_ok=True)

    now = datetime.utcnow()
    recent_time = now - timedelta(minutes=10)     # 10 分钟前创建，处于 60 分钟保护期内
    expired_time = now - timedelta(minutes=90)    # 90 分钟前创建，已超时废弃

    sid_recent_low = f"test_worker_recent_low_{uuid.uuid4().hex[:8]}"
    sid_expired_low = f"test_worker_expired_low_{uuid.uuid4().hex[:8]}"
    sid_expired_high = f"test_worker_expired_high_{uuid.uuid4().hex[:8]}"

    # 在数据库中直接插入测试记录
    async with AsyncSessionLocal() as db:
        s1 = InterviewSessionModel(
            id=sid_recent_low,
            candidate_profile={"name": "Alice"},
            difficulty="mid",
            language="zh",
            status="in_progress",
            round_count=1,
            created_at=recent_time,
        )
        s2 = InterviewSessionModel(
            id=sid_expired_low,
            candidate_profile={"name": "Bob"},
            difficulty="mid",
            language="zh",
            status="in_progress",
            round_count=1,
            created_at=expired_time,
        )
        s3 = InterviewSessionModel(
            id=sid_expired_high,
            candidate_profile={"name": "Charlie"},
            difficulty="mid",
            language="zh",
            status="completed",
            round_count=4,
            created_at=expired_time,
        )
        db.add_all([s1, s2, s3])
        await db.commit()

    # 在磁盘 uploads/transcripts 目录生成测试镜像文件
    disk_files = []
    for sid in [sid_recent_low, sid_expired_low, sid_expired_high]:
        md_file = os.path.join(TRANSCRIPTS_DIR, f"{sid}_prompts.md")
        json_file = os.path.join(TRANSCRIPTS_DIR, f"{sid}_prompts.json")
        with open(md_file, "w", encoding="utf-8") as f:
            f.write(f"# Test Transcript for {sid}")
        with open(json_file, "w", encoding="utf-8") as f:
            f.write(f'{{"session_id": "{sid}"}}')
        disk_files.extend([md_file, json_file])

    try:
        # 执行定时清理 Worker（保护 60 分钟内活跃会话，门槛 3 轮）
        result = await run_periodic_cleanup(idle_threshold_minutes=60, min_rounds=3)
        assert result["status"] == "success"
        assert result["deleted_sessions"] >= 1

        # 验证数据库状态
        async with AsyncSessionLocal() as db:
            r_recent = await db.get(InterviewSessionModel, sid_recent_low)
            r_expired_low = await db.get(InterviewSessionModel, sid_expired_low)
            r_expired_high = await db.get(InterviewSessionModel, sid_expired_high)

            # 1. 保护期内 (<60m) 的不足 3 轮会话依然存在
            assert r_recent is not None, "保护期内未达3轮的会话不应被删除"
            # 2. 超过保护期 (>60m) 且不足 3 轮的废弃会话被清理
            assert r_expired_low is None, "超期且未达3轮的废弃会话必须被清理"
            # 3. 超过保护期但达到 3 轮的会话予以保留
            assert r_expired_high is not None, "达到3轮的有效会话不应被删除"

        # 验证磁盘文件状态
        recent_md = os.path.join(TRANSCRIPTS_DIR, f"{sid_recent_low}_prompts.md")
        expired_low_md = os.path.join(TRANSCRIPTS_DIR, f"{sid_expired_low}_prompts.md")
        expired_high_md = os.path.join(TRANSCRIPTS_DIR, f"{sid_expired_high}_prompts.md")

        assert os.path.exists(recent_md), "保护期内会话的磁盘镜像文件应保留"
        assert not os.path.exists(expired_low_md), "超期废弃会话的磁盘镜像文件应已被删除"
        assert os.path.exists(expired_high_md), "有效会话的磁盘镜像文件应保留"

    finally:
        # 清理测试残留会话及磁盘文件
        await session_manager.delete_sessions([sid_recent_low, sid_expired_high])
        for p in disk_files:
            if os.path.exists(p):
                try:
                    os.remove(p)
                except OSError:
                    pass


@pytest.mark.asyncio
async def test_cleanup_scheduler_loop_lifecycle():
    """
    测试后台清理任务循环的生命周期与优雅退出（CancelledError 处理）。
    """
    task = asyncio.create_task(
        cleanup_scheduler_loop(
            interval_seconds=1,
            idle_threshold_minutes=60,
            min_rounds=3,
        )
    )
    # 等待协程启动
    await asyncio.sleep(0.05)
    assert not task.done(), "清理任务应当持续在后台循环运行"

    # 发送取消信号，测试是否优雅退出无未捕获异常
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    assert task.done()


@pytest.mark.asyncio
async def test_api_cleanup_incomplete_with_older_than_minutes():
    """
    测试 POST /api/v1/interviews/history/cleanup-incomplete 接口支持 older_than_minutes 参数。
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/api/v1/interviews/history/cleanup-incomplete", params={
            "min_rounds": 3,
            "older_than_minutes": 60,
        })
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "success"
        assert data["min_rounds"] == 3
        assert data["older_than_minutes"] == 60
        assert "deleted" in data

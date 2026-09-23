"""简历打磨（AI 体检）接口测试：诊断报告 + 采纳建议生成新版本副本。"""
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.resume import SavedResume
from app.models.db import AsyncSessionLocal, init_db

POLISH_RESUME_TEXT = (
    "张三 高级后端工程师\n"
    "优化核心链路，将超时率从3%降低到0.1%\n"
    "负责多个业务模块的开发与维护\n"
    "技能：Python, FastAPI, Redis"
)


async def _insert_resume(filename: str = "polish_case.pdf", raw_text: str = POLISH_RESUME_TEXT) -> str:
    await init_db()
    async with AsyncSessionLocal() as session:
        resume = SavedResume(
            filename=filename,
            raw_text=raw_text,
            parsed_profile={"name": "张三", "skills": ["Python", "FastAPI"]},
        )
        session.add(resume)
        await session.commit()
        await session.refresh(resume)
        return resume.id


async def _cleanup(resume_ids) -> None:
    async with AsyncSessionLocal() as session:
        for rid in resume_ids:
            resume = await session.get(SavedResume, rid)
            if resume:
                await session.delete(resume)
        await session.commit()


@pytest.mark.asyncio
async def test_polish_diagnose_returns_report():
    resume_id = await _insert_resume("polish_diagnose.pdf")
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                f"/api/v1/profiles/resumes/{resume_id}/polish",
                json={"jd_text": "负责高并发消息队列与缓存架构", "target_role": "资深后端工程师"},
            )
            assert res.status_code == 200
            report = res.json()["report"]
            assert isinstance(report["match_score"], int)
            assert report["overall_comment"]
            assert isinstance(report["issues"], list) and report["issues"]
            assert isinstance(report["gaps"], list)
            for issue in report["issues"]:
                assert "quote" in issue and "applicable" in issue

            # 诊断不修改简历本身
            detail_res = await client.get(f"/api/v1/profiles/resumes/{resume_id}")
            assert detail_res.json()["raw_text"] == POLISH_RESUME_TEXT
    finally:
        await _cleanup([resume_id])


@pytest.mark.asyncio
async def test_polish_diagnose_without_jd():
    resume_id = await _insert_resume("polish_no_jd.pdf")
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                f"/api/v1/profiles/resumes/{resume_id}/polish", json={}
            )
            assert res.status_code == 200
            report = res.json()["report"]
            # 未提供 JD 时 score 为空、缺口列表为空
            assert report["match_score"] is None
            assert report["gaps"] == []
    finally:
        await _cleanup([resume_id])


@pytest.mark.asyncio
async def test_polish_diagnose_404():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/api/v1/profiles/resumes/no-such-id/polish", json={})
        assert res.status_code == 404


@pytest.mark.asyncio
async def test_polish_apply_creates_new_copy():
    resume_id = await _insert_resume("polish_apply.pdf")
    created_id = None
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                f"/api/v1/profiles/resumes/{resume_id}/polish/apply",
                json={
                    "target_role": "资深后端工程师",
                    "items": [
                        # 可精确定位
                        {
                            "quote": "负责多个业务模块的开发与维护",
                            "rewritten": "独立负责 3 个核心业务模块的迭代与稳定性",
                        },
                        # 原文中不存在，应被跳过
                        {"quote": "这句原文里没有", "rewritten": "无论改成什么"},
                    ],
                },
            )
            assert res.status_code == 200
            data = res.json()
            assert len(data["applied"]) == 1
            assert len(data["skipped"]) == 1

            new_resume = data["resume"]
            created_id = new_resume["id"]
            assert new_resume["id"] != resume_id
            assert new_resume["source_resume_id"] == resume_id
            # 文件名保留原扩展名并带上目标岗位标签
            assert new_resume["filename"] == "polish_apply-资深后端工程师.pdf"
            assert "独立负责 3 个核心业务模块" in new_resume["raw_text"]
            assert "这句原文里没有" not in new_resume["raw_text"]
            assert new_resume["parsed_profile"]  # 优化版重新解析了画像

            # 原件完全不动
            detail_res = await client.get(f"/api/v1/profiles/resumes/{resume_id}")
            assert detail_res.json()["raw_text"] == POLISH_RESUME_TEXT
    finally:
        await _cleanup([resume_id, created_id])


@pytest.mark.asyncio
async def test_polish_apply_validation():
    resume_id = await _insert_resume("polish_validate.pdf")
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. 空建议列表 -> 400
            empty_res = await client.post(
                f"/api/v1/profiles/resumes/{resume_id}/polish/apply", json={"items": []}
            )
            assert empty_res.status_code == 400

            # 2. 全部无法定位 -> 400，且不产生新简历
            miss_res = await client.post(
                f"/api/v1/profiles/resumes/{resume_id}/polish/apply",
                json={"items": [{"quote": "不存在的句子", "rewritten": "x"}]},
            )
            assert miss_res.status_code == 400

            # 3. 不存在的简历 -> 404
            missing_res = await client.post(
                "/api/v1/profiles/resumes/no-such-id/polish/apply",
                json={"items": [{"quote": "a", "rewritten": "b"}]},
            )
            assert missing_res.status_code == 404

            # 4. 失败请求后原件未被改动，也没有多余副本
            detail_res = await client.get(f"/api/v1/profiles/resumes/{resume_id}")
            assert detail_res.json()["raw_text"] == POLISH_RESUME_TEXT
    finally:
        await _cleanup([resume_id])

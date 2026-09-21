import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.resume import SavedResume
from app.models.db import AsyncSessionLocal, init_db


@pytest.mark.asyncio
async def test_resume_detail_and_deletion():
    # 1. Insert a test resume directly
    async with AsyncSessionLocal() as session:
        test_resume = SavedResume(
            filename="test_resume.pdf",
            raw_text="精通 React 和 FastAPI 的全栈专家",
            parsed_profile={"skills": ["React", "FastAPI"], "title": "全栈专家"}
        )
        session.add(test_resume)
        await session.commit()
        await session.refresh(test_resume)
        resume_id = test_resume.id

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 2. Get resume list
        list_res = await client.get("/api/v1/profiles/resumes")
        assert list_res.status_code == 200
        resumes = list_res.json()["resumes"]
        assert any(r["id"] == resume_id for r in resumes)

        # 3. Get resume detail
        detail_res = await client.get(f"/api/v1/profiles/resumes/{resume_id}")
        assert detail_res.status_code == 200
        assert "全栈专家" in detail_res.json()["raw_text"]

        # 4. Delete resume
        del_res = await client.delete(f"/api/v1/profiles/resumes/{resume_id}")
        assert del_res.status_code == 200
        assert del_res.json()["status"] == "success"

        # 5. Verify 404
        verify_res = await client.get(f"/api/v1/profiles/resumes/{resume_id}")
        assert verify_res.status_code == 404


async def _insert_resume(filename: str = "resume_to_update.pdf") -> str:
    # 幂等建表/加列迁移，保证旧库也有 updated_at 列（须在测试自身的事件循环内执行）
    await init_db()
    async with AsyncSessionLocal() as session:
        resume = SavedResume(
            filename=filename,
            raw_text="精通 React 和 FastAPI 的全栈专家",
            parsed_profile={"name": "候选人", "skills": ["React", "FastAPI"]}
        )
        session.add(resume)
        await session.commit()
        await session.refresh(resume)
        return resume.id


async def _delete_resume(resume_id: str) -> None:
    async with AsyncSessionLocal() as session:
        resume = await session.get(SavedResume, resume_id)
        if resume:
            await session.delete(resume)
            await session.commit()


@pytest.mark.asyncio
async def test_resume_update_fields():
    resume_id = await _insert_resume()
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Update filename + parsed_profile + raw_text in one request
            update_res = await client.put(
                f"/api/v1/profiles/resumes/{resume_id}",
                json={
                    "filename": "前端架构师版.pdf",
                    "raw_text": "十年前端架构经验，主导微前端体系建设",
                    "parsed_profile": {
                        "name": "李四",
                        "experience_years": 10,
                        "skills": ["React", "TypeScript", "微前端"],
                        "education": "计算机科学学士",
                        "summary_profile": "资深前端架构师",
                    },
                },
            )
            assert update_res.status_code == 200
            data = update_res.json()
            assert data["filename"] == "前端架构师版.pdf"
            assert data["raw_text"].startswith("十年前端架构经验")
            assert data["parsed_profile"]["name"] == "李四"
            assert data["updated_at"] is not None

            # 2. Changes are persisted
            detail_res = await client.get(f"/api/v1/profiles/resumes/{resume_id}")
            assert detail_res.status_code == 200
            detail = detail_res.json()
            assert detail["filename"] == "前端架构师版.pdf"
            assert detail["parsed_profile"]["experience_years"] == 10
    finally:
        await _delete_resume(resume_id)


@pytest.mark.asyncio
async def test_resume_update_validation():
    resume_id = await _insert_resume("validation_case.pdf")
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Empty filename -> 400
            empty_name_res = await client.put(
                f"/api/v1/profiles/resumes/{resume_id}", json={"filename": "   "}
            )
            assert empty_name_res.status_code == 400

            # 2. Empty raw_text -> 400
            empty_text_res = await client.put(
                f"/api/v1/profiles/resumes/{resume_id}", json={"raw_text": "  "}
            )
            assert empty_text_res.status_code == 400

            # 3. Non-existent id -> 404
            missing_res = await client.put(
                "/api/v1/profiles/resumes/non-existent-id", json={"filename": "新名字"}
            )
            assert missing_res.status_code == 404

            # 4. Original record untouched by failed requests
            detail_res = await client.get(f"/api/v1/profiles/resumes/{resume_id}")
            assert detail_res.json()["filename"] == "validation_case.pdf"
    finally:
        await _delete_resume(resume_id)


@pytest.mark.asyncio
async def test_resume_update_reparse():
    resume_id = await _insert_resume("reparse_case.pdf")
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # reparse=True: profile is regenerated from the (new) raw text
            reparse_res = await client.put(
                f"/api/v1/profiles/resumes/{resume_id}",
                json={"raw_text": "资深后端工程师，精通 Go 与 Kubernetes", "reparse": True},
            )
            assert reparse_res.status_code == 200
            profile = reparse_res.json()["parsed_profile"]
            assert isinstance(profile, dict)
            assert "skills" in profile

            # parsed_profile explicitly provided together with reparse=False
            manual_res = await client.put(
                f"/api/v1/profiles/resumes/{resume_id}",
                json={"parsed_profile": {"name": "王五", "skills": ["Go"]}},
            )
            assert manual_res.status_code == 200
            assert manual_res.json()["parsed_profile"]["name"] == "王五"
    finally:
        await _delete_resume(resume_id)

import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.resume import SavedResume
from app.models.db import AsyncSessionLocal


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

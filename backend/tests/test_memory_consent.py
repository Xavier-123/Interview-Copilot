import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.db import AsyncSessionLocal, init_db
from app.models.architecture import MemoryItemModel


@pytest.mark.asyncio
async def test_candidate_memory_requires_and_respects_consent():
    await init_db()
    owner_id = f"test-owner-{uuid.uuid4().hex}"
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "owner_id": owner_id,
            "scope": "candidate",
            "content": "候选人希望加强系统设计表达",
            "consent": True,
        }
        denied = await client.post("/api/v1/memory", json=payload)
        assert denied.status_code == 403

        enabled = await client.post(
            "/api/v1/memory/consent",
            json={"owner_id": owner_id, "enabled": True},
        )
        assert enabled.status_code == 200

        created = await client.post("/api/v1/memory", json=payload)
        assert created.status_code == 200

        visible = await client.get(f"/api/v1/memory?owner_id={owner_id}")
        assert visible.json()["consent"] is True
        assert visible.json()["count"] == 1

        revoked = await client.post(
            "/api/v1/memory/consent",
            json={"owner_id": owner_id, "enabled": False},
        )
        assert revoked.status_code == 200

        hidden = await client.get(f"/api/v1/memory?owner_id={owner_id}")
        assert hidden.json()["consent"] is False
        assert hidden.json()["count"] == 0

    async with AsyncSessionLocal() as db:
        await db.execute(
            MemoryItemModel.__table__.delete().where(MemoryItemModel.owner_id == owner_id)
        )
        await db.commit()

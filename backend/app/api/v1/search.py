from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.search import search_service


router = APIRouter(prefix="/search", tags=["search"])


class SearchConfigRequest(BaseModel):
    provider: str = "tavily"
    api_key: Optional[str] = None


@router.post("/test")
async def test_search_connection(req: Optional[SearchConfigRequest] = None):
    config = req.model_dump() if req else None
    outcome = await search_service.search(
        "Python software engineering latest best practices",
        max_results=1,
        config=config,
    )
    return outcome.to_metadata()

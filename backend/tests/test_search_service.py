import json

import httpx
import pytest

from app.services.search import SearchOutcome, SearchResult, SearchService
from app.services.session_manager import SessionManager


@pytest.mark.asyncio
async def test_tavily_success_normalizes_results_and_uses_bearer_auth():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == "https://api.tavily.com/search"
        assert request.headers["Authorization"] == "Bearer sentinel-key"
        body = json.loads(request.content)
        assert "api_key" not in body
        assert body["search_depth"] == "basic"
        assert body["max_results"] == 3
        return httpx.Response(
            200,
            json={
                "results": [
                    {
                        "title": "Redis documentation",
                        "url": "https://redis.io/docs/latest/",
                        "content": "Current Redis documentation and operational guidance.",
                        "score": 0.92,
                    }
                ]
            },
        )

    service = SearchService(transport=httpx.MockTransport(handler))
    outcome = await service.search(
        "Redis best practices",
        max_results=3,
        config={"provider": "tavily", "api_key": "sentinel-key"},
    )

    assert outcome.succeeded is True
    assert outcome.results[0].url == "https://redis.io/docs/latest/"
    assert outcome.to_metadata()["results"][0]["title"] == "Redis documentation"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status_code", "error_code"),
    [(401, "unauthorized"), (403, "unauthorized"), (429, "quota_exceeded"), (500, "upstream_error")],
)
async def test_tavily_http_failures_are_normalized_without_fake_results(status_code, error_code):
    service = SearchService(
        transport=httpx.MockTransport(lambda request: httpx.Response(status_code, json={}))
    )
    outcome = await service.search(
        "distributed systems",
        config={"provider": "tavily", "api_key": "sentinel-key"},
    )

    assert outcome.status == "failed"
    assert outcome.error_code == error_code
    assert outcome.results == []


@pytest.mark.asyncio
async def test_tavily_empty_results_are_not_replaced_with_synthetic_content():
    service = SearchService(
        transport=httpx.MockTransport(lambda request: httpx.Response(200, json={"results": []}))
    )
    outcome = await service.search(
        "an unusually specific interview query",
        config={"provider": "tavily", "api_key": "sentinel-key"},
    )

    assert outcome.error_code == "no_results"
    assert outcome.results == []
    assert outcome.to_prompt_context() == ""


@pytest.mark.asyncio
async def test_tavily_timeout_is_non_fatal():
    def timeout_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timed out", request=request)

    service = SearchService(transport=httpx.MockTransport(timeout_handler))
    outcome = await service.search(
        "Python architecture",
        config={"provider": "tavily", "api_key": "sentinel-key"},
    )

    assert outcome.error_code == "timeout"
    assert outcome.results == []


@pytest.mark.asyncio
async def test_missing_credentials_is_explicit(monkeypatch):
    monkeypatch.setattr("app.services.search.settings.TAVILY_API_KEY", "")
    outcome = await SearchService().search("Python architecture")
    assert outcome.error_code == "missing_credentials"
    assert outcome.results == []


@pytest.mark.asyncio
async def test_runtime_key_is_passed_to_graph_but_never_added_to_session_state(monkeypatch):
    manager = SessionManager()
    manager._sessions["session-1"] = {
        "session_id": "session-1",
        "stage": "technical",
        "messages": [],
        "status": "waiting_user",
    }
    captured = {}

    async def fake_ainvoke(state, config=None):
        captured["config"] = config
        return dict(state)

    async def fake_sync(session_id, state):
        captured["persisted"] = json.dumps(state, ensure_ascii=False)

    monkeypatch.setattr("app.services.session_manager.interview_app.ainvoke", fake_ainvoke)
    monkeypatch.setattr(manager, "_sync_state_to_db", fake_sync)

    state = await manager.submit_candidate_answer(
        "session-1",
        "candidate answer",
        search_config={"provider": "tavily", "api_key": "sentinel-secret-key"},
    )

    assert captured["config"]["configurable"]["search_config"]["api_key"] == "sentinel-secret-key"
    assert "sentinel-secret-key" not in captured["persisted"]
    assert "sentinel-secret-key" not in json.dumps(state)


def test_markdown_export_includes_sources_but_not_credentials():
    manager = SessionManager()
    metadata = SearchOutcome(
        provider="tavily",
        query="Python best practices",
        status="success",
        results=[
            SearchResult(
                title="Python documentation",
                url="https://docs.python.org/3/",
                snippet="Official documentation",
            )
        ],
        latency_ms=24,
    ).to_metadata()
    rendered = manager.render_transcript_markdown(
        {
            "session": {"title": "Test"},
            "messages": [
                {
                    "role": "assistant",
                    "name": "technical",
                    "content": "Question",
                    "search_metadata": metadata,
                }
            ],
        }
    )

    assert "[Python documentation](https://docs.python.org/3/)" in rendered
    assert "api_key" not in rendered

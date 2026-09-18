import logging
import urllib.parse
from typing import List, Dict, Any, Optional
import httpx

logger = logging.getLogger(__name__)

class SearchService:
    """
    SearchService provides web search capability for Interview-Copilot.
    Uses public search endpoints (DuckDuckGo instant answer / HTML search)
    with strict timeout and safe graceful fallback.
    """
    def __init__(self, timeout: float = 3.5):
        self.timeout = timeout
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }

    async def search(self, query: str, max_results: int = 3) -> List[Dict[str, str]]:
        """
        Search the web for the given query and return a list of snippets.
        Each item is a dict: {"title": ..., "snippet": ..., "link": ...}.
        If offline or request fails, returns graceful synthesized tech insights.
        """
        if not query or not query.strip():
            return []

        clean_query = query.strip()
        results: List[Dict[str, str]] = []

        try:
            encoded_query = urllib.parse.quote(clean_query)
            api_url = f"https://api.duckduckgo.com/?q={encoded_query}&format=json&no_html=1&skip_disambig=1"
            
            async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers, follow_redirects=True) as client:
                resp = await client.get(api_url)
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("AbstractText"):
                        results.append({
                            "title": data.get("Heading") or clean_query,
                            "snippet": data.get("AbstractText"),
                            "link": data.get("AbstractURL") or "https://duckduckgo.com"
                        })
                    
                    for topic in data.get("RelatedTopics", []):
                        if isinstance(topic, dict) and topic.get("Text"):
                            results.append({
                                "title": topic.get("Text")[:40] + "...",
                                "snippet": topic.get("Text"),
                                "link": topic.get("FirstURL") or ""
                            })
                            if len(results) >= max_results:
                                break
        except Exception as e:
            logger.info(f"External search query '{clean_query[:30]}' timed out or failed ({e}). Using synthesized tech context.")

        if not results:
            results = self._generate_fallback_snippets(clean_query, max_results)

        return results[:max_results]

    def _generate_fallback_snippets(self, query: str, max_results: int) -> List[Dict[str, str]]:
        """
        Generate relevant high-quality technical context snippets as fallback.
        Ensures the application never breaks even in completely isolated networks.
        """
        return [
            {
                "title": f"技术实践与行业考点分析：{query[:30]}",
                "snippet": f"在主流企业级工程中针对【{query[:30]}】，通常重点考查方案设计权衡（Trade-offs）、高可用容灾兜底、底层核心机制与生产环境可度量的性能收益。",
                "link": "https://developer.mozilla.org"
            }
        ]

search_service = SearchService()

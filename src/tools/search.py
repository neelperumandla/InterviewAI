from tavily import TavilyClient
from src.config import config


def build_tavily_client() -> TavilyClient:
    return TavilyClient(api_key=config.TAVILY_API_KEY)


def search_interview_trends(company: str, role: str) -> str:
    """Run multiple targeted searches and return concatenated results."""
    client = build_tavily_client()

    # Testing mode: keep this intentionally small to reduce latency/cost.
    # Reduce to 2 searches (instead of 4) for quicker iteration.
    queries = [
        f"{company} {role} interview questions 2025",
        f"{company} software engineer interview process experience",
    ]

    all_results: list[str] = []
    for query in queries:
        try:
            response = client.search(
                query=query,
                search_depth="advanced",
                max_results=4,
                include_answer=True,
            )
            if response.get("answer"):
                all_results.append(f"[Query: {query}]\n{response['answer']}")
            for result in response.get("results", []):
                snippet = result.get("content", "")[:600]
                url = result.get("url", "")
                if snippet:
                    all_results.append(f"Source: {url}\n{snippet}")
        except Exception as e:
            all_results.append(f"[Search error for '{query}': {e}]")

    return "\n\n---\n\n".join(all_results)


def search_broader(company: str, role: str) -> str:
    """Broader fallback search when initial results are thin."""
    client = build_tavily_client()

    # Testing mode: also keep broader search small.
    queries = [
        f"{role} technical interview preparation 2025",
        f"software engineer interview questions system design behavioral",
    ]

    all_results: list[str] = []
    for query in queries:
        try:
            response = client.search(
                query=query,
                search_depth="basic",
                max_results=3,
                include_answer=True,
            )
            if response.get("answer"):
                all_results.append(f"[Query: {query}]\n{response['answer']}")
            for result in response.get("results", []):
                snippet = result.get("content", "")[:500]
                if snippet:
                    all_results.append(snippet)
        except Exception as e:
            all_results.append(f"[Search error for '{query}': {e}]")

    return "\n\n---\n\n".join(all_results)

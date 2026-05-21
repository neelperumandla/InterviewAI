"""Research Agent — company interview intelligence with DB cache."""
import json
import re

from langchain_core.messages import HumanMessage, SystemMessage

from src.config import config
from src.llm_router import get_llm_for_agent
from src.memory.research_cache import get_cached_research, save_research_cache
from src.state import InterviewState
from src.tools.search import search_interview_trends, search_broader


_DEFAULT_TOPICS = [
    "Two Sum",
    "Valid Parentheses",
    "Binary Search",
]

_SYSTEM_PROMPT = """\
You are an expert interview research analyst. Synthesise raw web search \
results about a company's interview process into a clear, structured report.

Return a JSON object with these exact keys:
{
  "summary": "<2-3 paragraph narrative about the TECHNICAL interview process only>",
  "interview_type": "<one of: ml_focused | technical>",
  "key_topics": ["<topic1>", "<topic2>", ...],
  "quality": "<one of: thin | good | excellent>"
}

IMPORTANT:
- key_topics must be 5-8 specific, LeetCode-style coding topics only.
- No behavioral, culture, or system-design-only topics.
"""


def _normalize_topics(key_topics: list) -> list[str]:
    technical_keywords = [
        "two sum", "valid parentheses", "merge intervals", "binary search",
        "dynamic programming", "coin change", "bfs", "dfs", "graph", "tree",
        "array", "string", "sorting", "sliding window", "two-pointer",
        "two pointer", "recursion", "backtracking", "stack", "queue", "heap",
        "linked list", "interval", "leetcode",
    ]

    def is_allowed(t: str) -> bool:
        tl = (t or "").lower()
        blocked = ["behavioral", "star", "culture", "leadership", "project", "system design"]
        if any(b in tl for b in blocked):
            return False
        return any(k in tl for k in technical_keywords)

    filtered = [t for t in key_topics if is_allowed(t)]
    if len(filtered) < config.CALIBRATION_QUESTION_COUNT:
        filtered = list(_DEFAULT_TOPICS)
    return filtered[: config.CALIBRATION_QUESTION_COUNT]


def research_node(state: InterviewState) -> dict:
    company = state["company"]
    role = state["role"]
    n = config.CALIBRATION_QUESTION_COUNT

    cached = get_cached_research(company, role)
    if cached:
        topics = _normalize_topics(cached.get("topics", []))
        return {
            "research_results": cached["summary"],
            "interview_type": cached.get("interview_type", "technical"),
            "interview_topics": topics[:n],
            "research_quality": cached.get("quality", "good"),
            "research_attempts": 1,
            "research_from_cache": True,
            "questions_answered": 0,
        }

    attempt = state.get("research_attempts", 0)
    raw_results = (
        search_interview_trends(company, role)
        if attempt == 0
        else search_broader(company, role)
    )

    llm = get_llm_for_agent("research")
    response = llm.invoke([
        SystemMessage(content=_SYSTEM_PROMPT),
        HumanMessage(content=f"""\
Company: {company}
Role: {role}
Search attempt: {attempt + 1}

Raw search results:
{raw_results[:8000]}

Synthesise into the required JSON format.
"""),
    ])

    raw_text = response.content.strip()
    json_match = re.search(r"\{.*\}", raw_text, re.DOTALL)
    parsed: dict = {}
    if json_match:
        try:
            parsed = json.loads(json_match.group())
        except json.JSONDecodeError:
            parsed = {}

    topics = _normalize_topics(parsed.get("key_topics", []))
    summary = parsed.get("summary", raw_text)
    interview_type = parsed.get("interview_type", "technical")
    quality = parsed.get("quality", "thin")

    save_research_cache(company, role, summary, interview_type, topics, quality)

    return {
        "research_results": summary,
        "interview_type": interview_type,
        "interview_topics": topics[:n],
        "research_quality": quality,
        "research_attempts": attempt + 1,
        "research_from_cache": False,
        "questions_answered": 0,
    }

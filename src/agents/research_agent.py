"""Research Agent — company interview intelligence with DB cache."""
import json
import re

from langchain_core.messages import HumanMessage, SystemMessage

from src.config import config
from src.interview_template import normalize_template, topics_for_template
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
  "summary": "<2-3 paragraph narrative about the TECHNICAL coding interview>",
  "interview_type": "<one of: ml_focused | technical>",
  "key_topics": ["<topic1>", "<topic2>", ...],
  "quality": "<one of: thin | good | excellent>",
  "interview_template": {
    "format": "<one_problem_followups | multi_problem>",
    "primary_questions": <int 1-3>,
    "follow_ups_per_problem": <int 0-3>,
    "format_label": "<short human label, e.g. Google-style: one problem + follow-ups>",
    "estimated_minutes": <int>
  }
}

IMPORTANT:
- key_topics: 5-8 LeetCode-style coding topics (no behavioral-only topics).
- interview_template must reflect how THIS company actually runs technical rounds:
  * Google / Alphabet / Waymo / DeepMind → format one_problem_followups, primary 1, follow_ups 2
  * Amazon / AWS → multi_problem, primary 2, follow_ups 0
  * Meta / Facebook → multi_problem, primary 2, follow_ups 1
  * Unknown → multi_problem, primary 3, follow_ups 0
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
    if len(filtered) < 1:
        filtered = list(_DEFAULT_TOPICS)
    return filtered


def _research_return(
    *,
    company: str,
    summary: str,
    interview_type: str,
    topics: list[str],
    quality: str,
    template: dict,
    from_cache: bool,
    attempts: int,
) -> dict:
    tmpl = normalize_template(template, company)
    picked = topics_for_template(tmpl, topics)
    if not picked:
        picked = _DEFAULT_TOPICS[: max(1, tmpl.get("primary_questions", 3))]

    return {
        "research_results": summary,
        "interview_type": interview_type,
        "interview_template": tmpl,
        "interview_topics": picked,
        "research_quality": quality,
        "research_attempts": attempts,
        "research_from_cache": from_cache,
        "questions_answered": 0,
        "interview_phase": "primary",
        "primary_question_stem": "",
        "coach_messages": [],
    }


def research_node(state: InterviewState) -> dict:
    company = state["company"]
    role = state["role"]

    cached = get_cached_research(company, role)
    if cached:
        topics = _normalize_topics(cached.get("topics", []))
        template = cached.get("interview_template") or {}
        return _research_return(
            company=company,
            summary=cached["summary"],
            interview_type=cached.get("interview_type", "technical"),
            topics=topics,
            quality=cached.get("quality", "good"),
            template=template,
            from_cache=True,
            attempts=1,
        )

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

Synthesise into the required JSON format. Set interview_template for {company}.
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
    template = normalize_template(parsed.get("interview_template"), company)

    save_research_cache(
        company, role, summary, interview_type, topics, quality, template,
    )

    return _research_return(
        company=company,
        summary=summary,
        interview_type=interview_type,
        topics=topics,
        quality=quality,
        template=template,
        from_cache=False,
        attempts=attempt + 1,
    )

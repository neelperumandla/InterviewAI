"""Research Agent — pure interview intelligence gatherer.

Takes company and role as input. Searches the web and synthesises a
structured report of interview topics and process details.

Does NOT receive or use candidate_profile — it stays neutral.
The Orchestrator is responsible for deciding which topics to prioritise
based on the research output combined with candidate history.
"""
import json
import re

from langchain_core.messages import HumanMessage, SystemMessage

from src.llm_router import get_llm_for_agent
from src.state import InterviewState
from src.tools.search import search_interview_trends, search_broader


_SYSTEM_PROMPT = """\
You are an expert interview research analyst. Synthesise raw web search \
results about a company's interview process into a clear, structured report.

Return a JSON object with these exact keys:
{
  "summary": "<2-3 paragraph narrative about the TECHNICAL interview process only (no behavioral/project).>",
  "interview_type": "<one of: ml_focused | technical>",
  "key_topics": ["<topic1>", "<topic2>", ...],
  "quality": "<one of: thin | good | excellent>"
}

Guidelines:
- "thin" = very little company-specific info; generic results only
- "good" = reasonable signal about this company/role's interview style
- "excellent" = rich, specific intel with named topics, rounds, question types
- "ml_focused" = strong ML/DS signal (model selection, metrics, data issues)
- "technical" = coding + algorithms only

IMPORTANT:
- This system must return ONLY technical coding/algorithms topics.
- Exclude behavioral questions, culture fit, leadership/STAR stories, project experience narratives,
  and non-coding interviews.
- key_topics must be 5-8 specific, LeetCode-style topics (e.g. "Two Sum", "Valid Parentheses",
  "Merge Intervals", "Binary Search", "Dynamic Programming: Coin Change", "Graph BFS/DFS").
"""


def research_node(state: InterviewState) -> dict:
    """Research Agent: searches for and synthesises interview intelligence."""
    company = state["company"]
    role = state["role"]
    attempt = state.get("research_attempts", 0)

    # First attempt uses focused company-specific search;
    # subsequent attempts (orchestrator decided to retry) use broader search
    if attempt == 0:
        raw_results = search_interview_trends(company, role)
    else:
        raw_results = search_broader(company, role)

    llm = get_llm_for_agent("research")

    user_prompt = f"""\
Company: {company}
Role: {role}
Search attempt: {attempt + 1}

Raw search results:
{raw_results[:8000]}

Synthesise into the required JSON format.
"""

    response = llm.invoke([
        SystemMessage(content=_SYSTEM_PROMPT),
        HumanMessage(content=user_prompt),
    ])

    raw_text = response.content.strip()
    json_match = re.search(r"\{.*\}", raw_text, re.DOTALL)
    parsed: dict = {}
    if json_match:
        try:
            parsed = json.loads(json_match.group())
        except json.JSONDecodeError:
            parsed = {}

    key_topics = parsed.get("key_topics", [])
    if not isinstance(key_topics, list):
        key_topics = []

    # Enforce coding/algorithms-only topics (no behavioral/project/culture).
    technical_keywords = [
        "two sum",
        "valid parentheses",
        "merge intervals",
        "binary search",
        "dynamic programming",
        "coin change",
        "bfs",
        "dfs",
        "graph",
        "tree",
        "array",
        "string",
        "sorting",
        "sliding window",
        "two-pointer",
        "two pointer",
        "recursion",
        "backtracking",
        "stack",
        "queue",
        "heap",
        "linked list",
        "interval",
        "leetcode",
    ]

    def is_allowed_topic(t: str) -> bool:
        tl = (t or "").lower()
        blocked = ["behavioral", "star", "culture", "leadership", "project", "system design", "collaboration"]
        if any(b in tl for b in blocked):
            return False
        # If it doesn't look like coding, exclude.
        return any(k in tl for k in technical_keywords)

    filtered_topics = [t for t in key_topics if is_allowed_topic(t)]
    if len(filtered_topics) < 5:
        filtered_topics = [
            "Two Sum",
            "Valid Parentheses",
            "Merge Intervals",
            "Binary Search",
            "Graph BFS/DFS",
            "Dynamic Programming: Coin Change",
        ]

    return {
        "research_results": parsed.get("summary", raw_text),
        "interview_type": parsed.get("interview_type", "technical"),
        "interview_topics": filtered_topics[:8],
        "research_quality": parsed.get("quality", "thin"),
        "research_attempts": attempt + 1,
    }

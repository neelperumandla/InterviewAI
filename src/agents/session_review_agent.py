"""Session Review Agent — end-of-session coach.

Produces a comprehensive post-session report including overall score,
performance tier, key strengths, knowledge gaps, and a prioritised study plan.
Uses the 'memory' model slot (gemini-2.5-flash-lite) since this is lightweight
summarisation, not deep reasoning.
"""
import json
import re

from langchain_core.messages import HumanMessage, SystemMessage

from src.config import config
from src.llm_router import get_llm_for_agent
from src.state import InterviewState


_SYSTEM_PROMPT = """\
You are an expert interview coach delivering a comprehensive post-session review. \
Give the candidate honest, specific, and actionable feedback.

Return a JSON object:
{
  "overall_score": <float 0.0-100.0>,
  "performance_tier": "<Outstanding | Strong | Acceptable | Needs Work | Poor>",
  "summary": "<3-4 paragraph narrative summary of the session>",
  "key_strengths": ["<strength1>", "<strength2>", ...],
  "key_gaps": ["<gap1>", "<gap2>", ...],
  "study_recommendations": [
    {"topic": "<topic>", "priority": "<High|Medium|Low>", "resources": "<brief suggestions>"},
    ...
  ],
  "next_steps": "<concrete 2-3 sentence action plan>"
}

Be honest. Avoid empty encouragement. The candidate needs truth to improve.
"""


def session_review_node(state: InterviewState) -> dict:
    """Session Review Agent: produces the final session report."""
    llm = get_llm_for_agent("memory")

    history = state.get("topic_history", [])
    passed = state.get("passed_topics", [])
    skipped = state.get("skipped_topics", [])
    profile = state.get("candidate_profile", {})

    session_data = {
        "company": state.get("company"),
        "role": state.get("role"),
        "interview_type": state.get("interview_type"),
        "pass_threshold": config.PASS_SCORE_THRESHOLD,
        "passed_topics": passed,
        "skipped_topics": skipped,
        "historical_profile_summary": {
            topic: {
                "historical_avg": data.get("avg_score"),
                "trend": data.get("trend"),
            }
            for topic, data in profile.get("topics", {}).items()
        },
        "topic_history": [
            {
                "topic": r.get("topic"),
                "question": r.get("question", "")[:300],
                "answer": r.get("answer", "")[:400],
                "score": r.get("score"),
                "passed": r.get("passed"),
                "feedback": r.get("feedback", "")[:300],
                "critique_notes": r.get("critique_notes", ""),
            }
            for r in history
        ],
    }

    user_prompt = f"Full session data:\n{json.dumps(session_data, indent=2)}"

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

    summary = parsed.get("summary", raw_text)
    recommendations = [
        f"{r.get('topic', '')} [{r.get('priority', 'Medium')}]: {r.get('resources', '')}"
        for r in parsed.get("study_recommendations", [])
    ]
    if not recommendations and skipped:
        recommendations = skipped

    return {
        "session_summary": summary,
        "study_recommendations": recommendations,
        "orchestrator_notes": json.dumps(parsed),
        "next_action": "end",
    }

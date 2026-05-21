"""Orchestrator — deterministic session flow (no LLM routing).

Calibration flow:
  1. Research (cached when fresh)
  2. Exactly CALIBRATION_QUESTION_COUNT coding questions across research topics
  3. Session review
"""
from src.config import config
from src.state import InterviewState


def orchestrator_node(state: InterviewState) -> dict:
    """Rule-based routing — predictable and fast."""
    n = config.CALIBRATION_QUESTION_COUNT
    topics = state.get("interview_topics", [])
    answered = state.get("questions_answered", 0)

    if not state.get("research_quality"):
        return {
            "next_action": "research",
            "orchestrator_notes": "Loading company interview research.",
        }

    if answered >= n or answered >= len(topics):
        return {
            "next_action": "session_review",
            "orchestrator_notes": f"Completed {answered} calibration questions.",
        }

    idx = min(answered, len(topics) - 1) if topics else 0
    return {
        "next_action": "interview",
        "current_topic_index": idx,
        "question_difficulty": "medium",
        "orchestrator_notes": f"Calibration question {answered + 1} of {min(n, len(topics) or n)}.",
    }


def route_after_orchestrator(state: InterviewState) -> str:
    """Return the routing *key* for conditional_edges (not the target node name)."""
    action = state.get("next_action", "session_review")
    if action in ("research", "interview", "session_review", "end"):
        return action
    return "session_review"

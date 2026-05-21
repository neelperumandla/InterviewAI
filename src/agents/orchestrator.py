"""Orchestrator — deterministic session flow (no LLM routing).

Flow:
  1. Research (cached when fresh) → interview_template + topics
  2. Interview turns per template (e.g. Google: 1 problem + follow-ups)
  3. Session review
"""
from src.interview_template import total_turns
from src.state import InterviewState


def orchestrator_node(state: InterviewState) -> dict:
    """Rule-based routing — predictable and fast."""
    template = state.get("interview_template") or {}
    topics = state.get("interview_topics", [])
    answered = state.get("questions_answered", 0)
    total = total_turns(template)

    if not state.get("research_quality"):
        return {
            "next_action": "research",
            "orchestrator_notes": "Loading company interview research.",
        }

    if answered >= total:
        return {
            "next_action": "session_review",
            "orchestrator_notes": f"Completed {answered} interview turn(s).",
        }

    fmt = template.get("format", "multi_problem")
    if fmt == "one_problem_followups":
        idx = 0
        phase = "follow_up" if answered > 0 else "primary"
        turn = answered + 1
        label = template.get("format_label", "One problem + follow-ups")
        return {
            "next_action": "interview",
            "current_topic_index": idx,
            "interview_phase": phase,
            "current_question": "",
            "question_difficulty": "medium",
            "orchestrator_notes": (
                f"{label} — turn {turn} of {total} "
                f"({'main problem' if phase == 'primary' else 'follow-up'})."
            ),
        }

    # multi_problem: one distinct problem per primary slot
    primary = template.get("primary_questions", len(topics) or total)
    idx = min(answered, len(topics) - 1) if topics else 0
    return {
        "next_action": "interview",
        "current_topic_index": idx,
        "interview_phase": "primary",
        "current_question": "",
        "question_difficulty": "medium",
        "orchestrator_notes": (
            f"{template.get('format_label', 'Coding interview')} — "
            f"problem {answered + 1} of {primary}."
        ),
    }


def route_after_orchestrator(state: InterviewState) -> str:
    """Return the routing *key* for conditional_edges (not the target node name)."""
    action = state.get("next_action", "session_review")
    if action in ("research", "interview", "session_review", "end"):
        return action
    return "session_review"

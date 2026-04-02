"""Orchestrator — master supervisor agent.

The single entry point after START. Uses tool-calling to dispatch to any
agent it deems necessary. Contains no hard-coded routing rules — the LLM
reasons freely given full session state + candidate history.

Tools available:
  run_research   → Research Agent
  ask_question   → Interview Agent
  end_session    → Session Review Agent
"""
import json

from langchain_core.tools import tool
from langchain_core.messages import HumanMessage, SystemMessage

from src.config import config
from src.llm_router import get_llm_for_agent
from src.state import InterviewState


# ── Routing tools (bodies are never executed — they are structured outputs) ───

@tool
def run_research(strategy: str, reason: str) -> str:
    """Call the Research Agent to gather company/role interview intelligence.

    Args:
        strategy: 'focused' for company-specific search, 'broad' for general
                  role-based fallback when company results were thin.
        reason:   Why research is needed at this point in the session.
    """
    return "research"


@tool
def ask_question(topic: str, difficulty: str, reason: str) -> str:
    """Call the Interview Agent to ask the candidate a question on a topic.

    Args:
        topic:      The specific topic to question the candidate on.
        difficulty: 'easy', 'medium', or 'hard' — calibrated to candidate history.
        reason:     Why this topic and difficulty were chosen.
    """
    return "interview"


@tool
def end_session(reason: str) -> str:
    """Trigger the final session review when the interview is complete.

    Args:
        reason: Why the session is ending now (all topics done, time limit, etc.)
    """
    return "session_review"


_ROUTING_TOOLS = [run_research, ask_question, end_session]

_SYSTEM_PROMPT = """\
You are the master orchestrator of an AI-powered technical interview prep system. \
You have full visibility into the session state and the candidate's historical \
performance. You control the entire session by calling the tools available to you.

You have three tools:
- run_research: gather interview intelligence for the company/role
- ask_question: ask the candidate a question on a specific topic
- end_session: trigger the final review when the session is complete

Your responsibilities:
- Decide when to gather or re-gather research
- Choose which topics to cover, in which order, and at what difficulty
- Calibrate difficulty based on the candidate's historical performance:
    strong (avg >= 75) → hard; moderate (avg 55-74) → medium; weak (avg < 55) → easy
- After an evaluation (critique_adjusted_score is set): decide whether the candidate
  passed that topic, should retry it, or should move on to avoid wasting time
- End the session when all topics have been adequately covered
- Factor in the candidate's history: if they consistently struggle with a topic,
  it deserves more attention; if they are strong, challenge them

You must always call exactly one tool. Use your judgment — there are no rules
other than serving the candidate's best interests.
"""


def orchestrator_node(state: InterviewState) -> dict:
    """Orchestrator: master supervisor that dispatches to any agent via tool-calls."""
    # Gemini function-calling: do not use tool_choice="required" because
    # langchain-google-genai may pass that string as a function name,
    # triggering a Gemini 400 error.
    # We still enforce "call exactly one tool" via prompt instructions.
    llm = get_llm_for_agent("orchestrator").bind_tools(_ROUTING_TOOLS)

    topics = state.get("interview_topics", [])
    idx = state.get("current_topic_index", 0)
    current_topic = topics[idx] if idx < len(topics) else None
    attempts = state.get("topic_attempts", {})

    # Build a focused state snapshot to pass to the LLM
    state_snapshot = {
        "company": state.get("company"),
        "role": state.get("role"),
        "research_quality": state.get("research_quality", ""),
        "research_attempts": state.get("research_attempts", 0),
        "interview_type": state.get("interview_type", "general"),
        "available_topics": topics,
        "current_topic_index": idx,
        "current_topic": current_topic,
        "topic_attempts": attempts,
        "passed_topics": state.get("passed_topics", []),
        "skipped_topics": state.get("skipped_topics", []),
        "last_critique_score": state.get("critique_adjusted_score"),
        "last_critique_notes": state.get("critique_notes", ""),
        "pass_threshold": config.PASS_SCORE_THRESHOLD,
        "max_attempts_per_topic": config.MAX_TOPIC_ATTEMPTS,
        "candidate_profile": state.get("candidate_profile", {}),
    }

    user_prompt = (
        "Current session state:\n"
        + json.dumps(state_snapshot, indent=2)
        + "\n\nDecide the next action and call the appropriate tool."
    )

    response = llm.invoke([
        SystemMessage(content=_SYSTEM_PROMPT),
        HumanMessage(content=user_prompt),
    ])

    tool_calls = getattr(response, "tool_calls", [])
    if not tool_calls:
        # Fallback: if no tool call somehow, end session
        return {
            "next_action": "session_review",
            "orchestrator_notes": "No tool call returned — defaulting to end session.",
        }

    call = tool_calls[0]
    tool_name = call["name"]
    tool_args = call.get("args", {})
    notes = tool_args.get("reason", "")

    update: dict = {"orchestrator_notes": notes}

    if tool_name == "run_research":
        update["next_action"] = "research"

    elif tool_name == "ask_question":
        update["next_action"] = "interview"
        update["question_difficulty"] = tool_args.get("difficulty", "medium")

        # Set current_topic_index to point at the requested topic
        requested_topic = tool_args.get("topic", "")
        if requested_topic and requested_topic in topics:
            new_idx = topics.index(requested_topic)
            update["current_topic_index"] = new_idx
        # If topic not found or blank, keep current index

    elif tool_name == "end_session":
        update["next_action"] = "session_review"

    else:
        update["next_action"] = "session_review"

    # ── After a critique result: update passed/skipped tracking ──────────────
    score = state.get("critique_adjusted_score")
    if score is not None and current_topic and tool_name != "run_research":
        passed = list(state.get("passed_topics", []))
        skipped = list(state.get("skipped_topics", []))

        if score >= config.PASS_SCORE_THRESHOLD:
            if current_topic not in passed:
                passed.append(current_topic)
        else:
            cur_attempts = attempts.get(current_topic, 0)
            if cur_attempts >= config.MAX_TOPIC_ATTEMPTS:
                if current_topic not in skipped:
                    skipped.append(current_topic)

        update["passed_topics"] = passed
        update["skipped_topics"] = skipped
        # Clear critique score so it doesn't retrigger next orchestrator pass
        update["critique_adjusted_score"] = None

    return update


def route_after_orchestrator(state: InterviewState) -> str:
    """Conditional edge function: maps next_action to a graph node name."""
    mapping = {
        "research":       "research",
        "interview":      "interview",
        "session_review": "session_review",
        "end":            "__end__",
    }
    return mapping.get(state.get("next_action", "session_review"), "session_review")

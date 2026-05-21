"""Interview Agent — question generator with human-in-the-loop."""
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.types import interrupt

from src.interview_template import total_turns
from src.llm_router import get_llm_for_agent
from src.state import InterviewState


_SYSTEM_PROMPT = """\
You are an expert technical interviewer. Ask ONE LeetCode-style coding problem.

Rules:
- The problem MUST match the given Topic.
- Do NOT reuse problems from the session list below.
- Pick a well-known pattern appropriate for the topic.

Output format (coding questions — ALWAYS include all marker blocks):
1) Problem description (plain text, above the markers)
2) SAMPLE_INPUT_BEGIN ... SAMPLE_INPUT_END  (concrete example)
3) EXPECTED_OUTPUT_BEGIN ... EXPECTED_OUTPUT_END  (matching the example)
4) STARTER_CODE_BEGIN ... STARTER_CODE_END  (starter code in the requested language only)

Do not use markdown code fences inside marker blocks. Keep sample I/O concise but complete.
"""

_FOLLOW_UP_PROMPT = """\
You are a technical interviewer continuing the SAME coding interview.

The candidate already worked on the primary problem below. Ask ONE follow-up — do not
introduce a brand-new unrelated LeetCode problem.

Good follow-up types: optimize time/space, handle edge cases, walk through complexity,
extend the problem (e.g. stream input), or debug their approach.

Keep it concise (2-5 sentences). No marker blocks required for follow-ups.
Reference the original problem explicitly.

End with one line telling them to type their answer in the app and click
"Submit response" when done (this is NOT a live chat turn).
"""


def _ensure_coding_markers(text: str, language: str) -> str:
    if "SAMPLE_INPUT_BEGIN" in text.upper():
        return text
    return (
        f"{text.strip()}\n\n"
        "SAMPLE_INPUT_BEGIN\n"
        "(see problem description)\n"
        "SAMPLE_INPUT_END\n\n"
        "EXPECTED_OUTPUT_BEGIN\n"
        "(see problem description)\n"
        "EXPECTED_OUTPUT_END\n\n"
        f"STARTER_CODE_BEGIN\n"
        f"// {language} starter\n"
        f"STARTER_CODE_END"
    )


def _turn_index(state: InterviewState) -> int:
    return state.get("questions_answered", 0) + 1


def _generate_primary(state: InterviewState, current_topic: str) -> str:
    language = state.get("coding_language", "python")
    prior = state.get("calibration_questions_asked", []) or []
    template = state.get("interview_template", {})
    total = total_turns(template)
    slot = _turn_index(state)

    llm = get_llm_for_agent("interview")
    prior_blurbs = "\n".join(f"- {p[:120]}..." for p in prior[-5:]) or "(none yet)"

    response = llm.invoke([
        SystemMessage(content=_SYSTEM_PROMPT),
        HumanMessage(content=f"""\
Company: {state.get('company')}
Role: {state.get('role')}
Interview format: {template.get('format_label', 'coding')}
Turn {slot} of {total} (main problem)
Topic (must match): {current_topic}
Difficulty: {state.get('question_difficulty', 'medium')}
Coding language: {language}

Problems already used (do NOT repeat):
{prior_blurbs}

Generate a NEW coding problem for topic "{current_topic}".
"""),
    ])
    return _ensure_coding_markers(response.content.strip(), language)


def _generate_follow_up(state: InterviewState, current_topic: str) -> str:
    stem = state.get("primary_question_stem") or state.get("current_question", "")
    last_answer = ""
    history = state.get("topic_history", [])
    if history:
        last_answer = history[-1].get("answer", "")[:1500]

    probe = state.get("follow_up_context", "").strip()
    coach_note = ""
    coaches = state.get("coach_messages", [])
    if coaches:
        coach_note = "Coach exchanges: " + "; ".join(
            f"[{c.get('mode')}] {c.get('content', '')[:80]}" for c in coaches[-4:]
        )

    llm = get_llm_for_agent("interview")
    template = state.get("interview_template", {})
    slot = _turn_index(state)
    total = total_turns(template)

    response = llm.invoke([
        SystemMessage(content=_FOLLOW_UP_PROMPT),
        HumanMessage(content=f"""\
Company: {state.get('company')}
Role: {state.get('role')}
Turn {slot} of {total} (follow-up on same problem)
Topic: {current_topic}

Original problem:
{stem[:3500]}

Candidate's last submitted answer:
{last_answer or '(none)'}

Evaluator suggested probe: {probe or '(use your judgment)'}

{coach_note}

Ask the next follow-up question now.
"""),
    ])
    body = response.content.strip()
    return f"[Follow-up — turn {slot} of {total}]\n\n{body}"


def generate_question_node(state: InterviewState) -> dict:
    topics = state.get("interview_topics", [])
    idx = state.get("current_topic_index", 0)

    if idx >= len(topics):
        return {"next_action": "session_review"}

    current_topic = topics[idx]
    phase = state.get("interview_phase", "primary")
    prior = state.get("calibration_questions_asked", []) or []

    if phase == "follow_up":
        question = _generate_follow_up(state, current_topic)
        stem = state.get("primary_question_stem", "")
    else:
        question = _generate_primary(state, current_topic)
        stem = question
        prior = list(prior) + [question[:500]]

    topic_attempts = dict(state.get("topic_attempts", {}))
    topic_attempts[current_topic] = _turn_index(state)

    return {
        "current_question": question,
        "primary_question_stem": stem,
        "topic_attempts": topic_attempts,
        "calibration_questions_asked": prior,
        "coach_messages": [],
    }


def collect_answer_node(state: InterviewState) -> dict:
    topics = state.get("interview_topics", [])
    idx = state.get("current_topic_index", 0)
    if idx >= len(topics):
        return {}

    current_topic = topics[idx]
    question = state.get("current_question", "")
    slot = _turn_index(state)
    phase = state.get("interview_phase", "primary")

    payload = interrupt({
        "topic": current_topic,
        "question": question,
        "question_index": slot,
        "attempt": slot,
        "max_attempts": 1,
        "difficulty": state.get("question_difficulty", "medium"),
        "phase": phase,
        "response_mode": "verbal" if phase == "follow_up" else "code",
        "format": (state.get("interview_template") or {}).get("format", "multi_problem"),
    })

    if isinstance(payload, dict):
        user_answer = payload.get("answer") or payload.get("content") or ""
        coach_log = payload.get("coach_log") or payload.get("coach_messages") or []
        turn_dialogue = payload.get("turn_dialogue") or []
    else:
        user_answer = str(payload)
        coach_log = []
        turn_dialogue = []

    return {
        "user_answer": user_answer,
        "coach_messages": coach_log,
        "turn_dialogue": turn_dialogue,
    }

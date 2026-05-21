"""Interview Agent — question generator with human-in-the-loop.

Split into two graph nodes so ``current_question`` is written to checkpoint
*before* interrupt(). Otherwise evaluation can see a stale question from a
prior turn while the UI shows the new problem.
"""
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.types import interrupt

from src.config import config
from src.llm_router import get_llm_for_agent
from src.state import InterviewState


_SYSTEM_PROMPT = """\
You are an expert technical interviewer conducting a realistic mock interview. \
Ask ONE focused, high-quality question for the given topic at the specified difficulty.

Guidelines:
- easy:   foundational concept or simple scenario; suitable for someone still learning
- medium: requires solid understanding; trade-offs or moderate complexity expected
- hard:   deep expertise expected; edge cases, design at scale, or nuanced analysis

Topic-specific guidance (coding-only):
- Algorithms/coding: ask about implementation, complexity, edge cases, or optimization challenges
- If this is a retry attempt: ask from a DIFFERENT angle than the previous question

Output format requirements:
1) For coding/algorithms questions (when "coding_like" is true):
   - Include exactly these marker blocks (even if empty content is not allowed):
     SAMPLE_INPUT_BEGIN ... SAMPLE_INPUT_END
     EXPECTED_OUTPUT_BEGIN ... EXPECTED_OUTPUT_END
     STARTER_CODE_BEGIN ... STARTER_CODE_END
   - Use the requested coding language for STARTER_CODE_BEGIN (the code only).
   - Include the actual problem description above the marker blocks.
   - Do NOT use markdown code fences inside the marker blocks.

2) For non-coding questions (coding_like is false):
   - Return ONLY the question as plain text, with no marker blocks.
"""


def _topic_context(state: InterviewState) -> tuple[list[str], int, str, dict, bool, int]:
    topics = state.get("interview_topics", [])
    idx = state.get("current_topic_index", 0)
    current_topic = topics[idx] if idx < len(topics) else ""
    topic_attempts = dict(state.get("topic_attempts", {}))
    topic_lower = (current_topic or "").lower()
    coding_like = any(
        k in topic_lower
        for k in [
            "algorithm", "coding", "leetcode", "data structure", "data-structure",
            "array", "string", "graph", "tree", "dynamic programming",
            "bfs", "dfs", "two sum", "binary search", "sort",
        ]
    )
    attempt_num = topic_attempts.get(current_topic, 0) + 1
    return topics, idx, current_topic, topic_attempts, coding_like, attempt_num


def generate_question_node(state: InterviewState) -> dict:
    """Generate a question and persist it to state before we pause for the answer."""
    topics, idx, current_topic, topic_attempts, coding_like, attempt_num = _topic_context(state)

    if idx >= len(topics):
        return {"next_action": "session_review"}

    topic_attempts[current_topic] = attempt_num
    difficulty = state.get("question_difficulty", "medium")
    follow_up_context = state.get("follow_up_context", "")

    llm = get_llm_for_agent("interview")
    user_prompt = f"""\
Company: {state.get('company')}
Role: {state.get('role')}
Interview type: {state.get('interview_type', 'general')}
Topic: {current_topic}
Difficulty: {difficulty}
Attempt number: {attempt_num} of {config.MAX_TOPIC_ATTEMPTS}
Coding-like: {coding_like}
Coding language: {state.get('coding_language', 'python')}
Previous answer context: {follow_up_context or 'None — this is the first question on this topic'}

Generate one interview question.
"""

    response = llm.invoke([
        SystemMessage(content=_SYSTEM_PROMPT),
        HumanMessage(content=user_prompt),
    ])
    question = response.content.strip()

    return {
        "current_question": question,
        "topic_attempts": topic_attempts,
    }


def collect_answer_node(state: InterviewState) -> dict:
    """Pause for the candidate's answer; ``current_question`` is already in state."""
    topics = state.get("interview_topics", [])
    idx = state.get("current_topic_index", 0)
    if idx >= len(topics):
        return {}

    current_topic = topics[idx]
    topic_attempts = state.get("topic_attempts", {})
    attempt_num = topic_attempts.get(current_topic, 1)
    question = state.get("current_question", "")
    difficulty = state.get("question_difficulty", "medium")

    user_answer = interrupt({
        "topic": current_topic,
        "question": question,
        "attempt": attempt_num,
        "max_attempts": config.MAX_TOPIC_ATTEMPTS,
        "difficulty": difficulty,
    })

    return {
        "user_answer": user_answer,
        "follow_up_context": "",
    }


# Backwards-compatible alias (unused by graph after split)
def interview_node(state: InterviewState) -> dict:
    out = generate_question_node(state)
    if out.get("next_action"):
        return out
    return {**out, **collect_answer_node({**state, **out})}

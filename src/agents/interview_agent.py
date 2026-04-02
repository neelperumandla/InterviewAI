"""Interview Agent — question generator with human-in-the-loop.

Generates one interview question per invocation based on the current topic
and difficulty set by the Orchestrator. Uses LangGraph's interrupt() to
pause execution and collect the candidate's answer before continuing.
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


def interview_node(state: InterviewState) -> dict:
    """Interview Agent: generate a question, interrupt to collect user answer."""
    topics = state.get("interview_topics", [])
    idx = state.get("current_topic_index", 0)

    if idx >= len(topics):
        return {"next_action": "session_review"}

    current_topic = topics[idx]
    difficulty = state.get("question_difficulty", "medium")
    follow_up_context = state.get("follow_up_context", "")
    topic_attempts = dict(state.get("topic_attempts", {}))

    topic_lower = (current_topic or "").lower()
    coding_like = any(
        k in topic_lower
        for k in [
            "algorithm",
            "coding",
            "leetcode",
            "data structure",
            "data-structure",
            "array",
            "string",
            "graph",
            "tree",
            "dynamic programming",
            "bfs",
            "dfs",
            "two sum",
            "binary search",
            "sort",
        ]
    )

    attempt_num = topic_attempts.get(current_topic, 0) + 1
    topic_attempts[current_topic] = attempt_num

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

    # ── Human-in-the-loop: pause here and collect the candidate's answer ──────
    user_answer = interrupt({
        "topic": current_topic,
        "question": question,
        "attempt": attempt_num,
        "max_attempts": config.MAX_TOPIC_ATTEMPTS,
        "difficulty": difficulty,
    })

    return {
        "current_question": question,
        "user_answer": user_answer,
        "topic_attempts": topic_attempts,
        "follow_up_context": "",
    }

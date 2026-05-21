import json
import re

from langchain_core.messages import HumanMessage, SystemMessage

from src.config import config
from src.llm_router import get_llm_for_agent
from src.state import InterviewState, TopicRecord


_SYSTEM_PROMPT = """\
You are a senior technical interviewer evaluating a candidate's answer. \
Be rigorous but fair — your output will be reviewed by a Critique Agent \
before being shown to the candidate.

Return a JSON object with these exact keys:
{{
  "score": <float 0.0-100.0>,
  "passed": <true|false>,
  "strengths": ["<point1>", ...],
  "weaknesses": ["<point1>", ...],
  "ideal_answer_outline": "<concise outline of what a strong answer would cover>",
  "follow_up_context": "<if partially correct, what to probe deeper on the next attempt>",
  "feedback": "<2-3 sentence overall feedback paragraph>"
}}

Scoring rubric (0–100):
- 90-100: Exceptional — complete, precise, with notable depth and concrete examples
- 75-89:  Strong — covers all key points with only minor gaps
- 60-74:  Acceptable — meets the pass threshold; lacks depth or has small errors
- 40-59:  Weak — correct direction but significant gaps or misconceptions
- 15-39:  Poor — major errors, off-topic, or very incomplete
- 0-14:   No meaningful answer / entirely irrelevant

Pass threshold: {threshold}
Difficulty level of this question: {difficulty}
Be objective. Do not inflate scores.

CRITICAL: The "Topic" line is only a broad curriculum category. The actual problem
to grade is EXACTLY the text under "Question asked". Never infer the problem from
the topic name alone — they can differ (e.g. topic says "Anagrams" but the question
text is a different LeetCode problem).
"""


def evaluation_node(state: InterviewState) -> dict:
    """Evaluation Agent: scores the candidate's answer on a 0-100 scale."""
    llm = get_llm_for_agent("evaluation")

    topics = state.get("interview_topics", [])
    idx = state.get("current_topic_index", 0)
    current_topic = topics[idx] if idx < len(topics) else "unknown"
    difficulty = state.get("question_difficulty", "medium")
    topic_attempts = state.get("topic_attempts", {})
    attempt_num = topic_attempts.get(current_topic, 1)
    question_text = state.get("current_question", "")

    system_prompt = _SYSTEM_PROMPT.format(
        threshold=config.PASS_SCORE_THRESHOLD,
        difficulty=difficulty,
    )

    user_prompt = f"""\
Company: {state.get('company')}
Role: {state.get('role')}
Curriculum category (do NOT use this alone to identify the problem): {current_topic}
Interview Type: {state.get('interview_type', 'general')}
Question difficulty: {difficulty}
Attempt: {attempt_num}

Question asked (this is the ONLY problem definition to grade against):
{question_text}

Candidate's answer:
{state.get('user_answer', '')}

Evaluate whether the answer solves the problem described under "Question asked".
"""

    response = llm.invoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_prompt),
    ])

    raw_text = response.content.strip()
    evaluation_raw = raw_text

    json_match = re.search(r"\{.*\}", raw_text, re.DOTALL)
    parsed: dict = {}
    if json_match:
        try:
            parsed = json.loads(json_match.group())
        except json.JSONDecodeError:
            parsed = {}

    score = min(100.0, max(0.0, float(parsed.get("score", 50.0))))

    feedback_parts: list[str] = []
    if parsed.get("feedback"):
        feedback_parts.append(parsed["feedback"])
    if parsed.get("ideal_answer_outline"):
        feedback_parts.append(f"\n**Ideal answer covers:** {parsed['ideal_answer_outline']}")
    if parsed.get("strengths"):
        feedback_parts.append("\n**Strengths:** " + "; ".join(parsed["strengths"]))
    if parsed.get("weaknesses"):
        feedback_parts.append("\n**Areas to improve:** " + "; ".join(parsed["weaknesses"]))

    feedback = "\n".join(feedback_parts)

    return {
        "evaluation_score": score,
        "evaluation_feedback": feedback,
        "evaluation_raw": evaluation_raw,
        "follow_up_context": parsed.get("follow_up_context", ""),
    }

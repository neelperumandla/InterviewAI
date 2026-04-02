"""Critique Agent — evaluation quality-gate.

Sits between the Evaluation Agent and the Orchestrator. Reviews the raw
evaluation BEFORE it is published to the candidate or used for routing.

Responsibilities:
- Check whether the score is fair given the question, difficulty and answer
- Identify if the Evaluation Agent missed key strengths or was overly harsh
- Adjust the score and improve the feedback if warranted
- Record what changed and why in critique_notes
"""
import json
import re

from langchain_core.messages import HumanMessage, SystemMessage

from src.config import config
from src.llm_router import get_llm_for_agent
from src.state import InterviewState, TopicRecord


_SYSTEM_PROMPT = """\
You are an expert interview coach acting as a quality-control reviewer for an \
AI evaluation agent. You receive a candidate's question, answer, and the raw \
evaluation produced by the Evaluation Agent. Your job is to:

1. Verify the score is fair and consistent with the rubric (0–100 scale)
2. Check if the feedback is accurate, complete, and actionable
3. Adjust the score and feedback if — and only if — there is a clear reason
4. Note what you changed and why

Return a JSON object:
{{
  "adjusted_score": <float 0.0-100.0>,
  "score_changed": <true|false>,
  "score_change_reason": "<explain if score changed, else empty string>",
  "feedback": "<final feedback to show the candidate — improved version of the raw feedback>",
  "critique_notes": "<internal summary of what you changed and why; empty if nothing changed>"
}}

Important:
- Do NOT inflate scores to be encouraging — accuracy is paramount
- Do NOT deflate scores to seem strict — be fair
- If the evaluation was accurate and complete, return it unchanged (score_changed: false)
- Consider the candidate's historical performance context if provided
- Pass threshold is {threshold}/100
"""


def critique_node(state: InterviewState) -> dict:
    """Critique Agent: reviews and potentially adjusts the Evaluation Agent output."""
    llm = get_llm_for_agent("critic")

    topics = state.get("interview_topics", [])
    idx = state.get("current_topic_index", 0)
    current_topic = topics[idx] if idx < len(topics) else "unknown"

    # Pull candidate history for this topic if available
    profile = state.get("candidate_profile", {})
    topic_history_data = profile.get("topics", {}).get(current_topic, {})
    history_context = ""
    if topic_history_data:
        history_context = (
            f"\nCandidate historical data for '{current_topic}': "
            f"avg={topic_history_data.get('avg_score')} | "
            f"trend={topic_history_data.get('trend')} | "
            f"level={topic_history_data.get('performance_level')}"
        )

    system_prompt = _SYSTEM_PROMPT.format(threshold=config.PASS_SCORE_THRESHOLD)

    user_prompt = f"""\
Company: {state.get('company')}
Role: {state.get('role')}
Topic: {current_topic}
Question difficulty: {state.get('question_difficulty', 'medium')}
{history_context}

Question asked:
{state.get('current_question', '')}

Candidate's answer:
{state.get('user_answer', '')}

Raw Evaluation Agent output:
Score: {state.get('evaluation_score', 0)}
Feedback:
{state.get('evaluation_feedback', '')}

Review this evaluation. Adjust if warranted.
"""

    response = llm.invoke([
        SystemMessage(content=system_prompt),
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

    raw_score = state.get("evaluation_score", 0.0)
    adjusted_score = min(100.0, max(0.0, float(parsed.get("adjusted_score", raw_score))))
    final_feedback = parsed.get("feedback", state.get("evaluation_feedback", ""))
    critique_notes = parsed.get("critique_notes", "")

    # Append to topic history with the final (critique-adjusted) values
    history = list(state.get("topic_history", []))
    record: TopicRecord = {
        "topic": current_topic,
        "question": state.get("current_question", ""),
        "answer": state.get("user_answer", ""),
        "raw_score": raw_score,
        "score": adjusted_score,
        "feedback": final_feedback,
        "critique_notes": critique_notes,
        "passed": adjusted_score >= config.PASS_SCORE_THRESHOLD,
    }
    history.append(record)

    return {
        "critique_adjusted_score": adjusted_score,
        "critique_feedback": final_feedback,
        "critique_notes": critique_notes,
        "topic_history": history,
    }

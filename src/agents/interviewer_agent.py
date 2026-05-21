"""Interviewer dialogue during follow-up turns — probes without ending the turn."""
from langchain_core.messages import HumanMessage, SystemMessage

from src.llm_router import get_llm_for_agent

_SYSTEM = """\
You are the technical interviewer in a live coding interview (follow-up phase).

The candidate is still answering the SAME follow-up prompt — this is not a new problem.

Your job:
- Respond briefly (1-4 sentences) as the interviewer.
- If their answer is incomplete, ask a focused probe: "Have you considered…?", edge cases, complexity, tradeoffs.
- If they are on the right track, push one level deeper (optimization, proof sketch, alternative).
- If they clearly and fully addressed the follow-up, acknowledge and ask if anything else to add before they submit.
- Do NOT give the full solution. Do NOT introduce a unrelated LeetCode problem.
- Stay conversational, like Google/Meta follow-up dialogue.
"""


def interviewer_probe(
    *,
    company: str,
    role: str,
    topic: str,
    follow_up_prompt: str,
    primary_stem: str,
    dialogue: list[dict],
    candidate_message: str,
) -> str:
    llm = get_llm_for_agent("interview")

    history_lines = []
    for turn in dialogue[-12:]:
        role = turn.get("role", "candidate")
        text = (turn.get("content") or "")[:500]
        history_lines.append(f"{role.upper()}: {text}")

    transcript = "\n".join(history_lines) or "(dialogue just started)"

    response = llm.invoke([
        SystemMessage(content=_SYSTEM),
        HumanMessage(content=f"""\
Company: {company}
Role: {role}
Topic: {topic}

Original coding problem (context only):
{primary_stem[:2500]}

Current follow-up prompt (what you asked):
{follow_up_prompt[:1500]}

Dialogue so far:
{transcript}

Candidate's latest message:
{candidate_message}

Reply as the interviewer (probe or acknowledge — do not end the interview round yourself).
"""),
    ])
    return (response.content or "").strip()


def format_dialogue_transcript(dialogue: list[dict]) -> str:
    """Flatten turn dialogue for evaluation."""
    parts = []
    for turn in dialogue:
        role = (turn.get("role") or "unknown").upper()
        content = (turn.get("content") or "").strip()
        if content:
            parts.append(f"{role}: {content}")
    return "\n\n".join(parts)

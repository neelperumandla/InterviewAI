"""In-session coach — hints scoped to the open question (not full solutions)."""
from langchain_core.messages import HumanMessage, SystemMessage

from src.llm_router import get_llm_for_agent

_COACH_MODES = {
    "syntax": (
        "Syntax / API help only. Give minimal snippets or signatures. "
        "Do NOT solve the algorithm."
    ),
    "think_aloud": (
        "Help them reason about approach, brute force vs optimal, tradeoffs. "
        "Do NOT write full solution code."
    ),
    "sanity_check": (
        "Interviewer-style sanity check on their idea or partial code. "
        "Point out edge cases or bugs without giving away the full answer."
    ),
    "complexity": (
        "Explain or verify time/space complexity of their stated approach. "
        "No complete implementation."
    ),
}

_DEFAULT_MODE_RULE = _COACH_MODES["think_aloud"]

_SYSTEM = """\
You are a technical interview COACH (not the grader). The candidate is mid-problem.

Rules:
- Never provide a complete optimal solution or full working code for the main problem.
- Keep replies under 120 words unless they ask for complexity analysis detail.
- Reference only the problem text provided — do not invent a different problem.
- If they paste code, comment on correctness/edge cases, not a rewrite of the whole solution.
- Be encouraging but honest.

Mode-specific rule:
{mode_rule}
"""


def coach_reply(
    *,
    mode: str,
    user_message: str,
    question_text: str,
    topic: str,
    company: str,
    role: str,
    prior_turns: list[dict],
) -> str:
    mode_rule = _COACH_MODES.get(mode, _DEFAULT_MODE_RULE)
    llm = get_llm_for_agent("chat")

    history_blurb = ""
    if prior_turns:
        lines = []
        for t in prior_turns[-6:]:
            m = t.get("mode", "coach")
            lines.append(f"[{m}] candidate: {t.get('content', '')[:200]}")
            if t.get("reply"):
                lines.append(f"coach: {t['reply'][:200]}")
        history_blurb = "\n".join(lines)

    response = llm.invoke([
        SystemMessage(content=_SYSTEM.format(mode_rule=mode_rule)),
        HumanMessage(content=f"""\
Company: {company}
Role: {role}
Topic category: {topic}
Coach mode: {mode}

Problem (only definition):
{question_text[:4000]}

Prior coach exchanges this turn:
{history_blurb or "(none)"}

Candidate message:
{user_message}
"""),
    ])
    return (response.content or "").strip()

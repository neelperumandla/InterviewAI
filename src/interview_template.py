"""Company interview format templates — used by research + orchestrator."""
from __future__ import annotations

from typing import TypedDict

from src.config import config


class InterviewTemplate(TypedDict, total=False):
    format: str  # one_problem_followups | multi_problem
    primary_questions: int
    follow_ups_per_problem: int
    format_label: str
    estimated_minutes: int


_DEFAULT_MULTI: InterviewTemplate = {
    "format": "multi_problem",
    "primary_questions": config.CALIBRATION_QUESTION_COUNT,
    "follow_ups_per_problem": 0,
    "format_label": f"{config.CALIBRATION_QUESTION_COUNT} independent coding problems",
    "estimated_minutes": 45,
}

_DEFAULT_GOOGLE: InterviewTemplate = {
    "format": "one_problem_followups",
    "primary_questions": 1,
    "follow_ups_per_problem": 2,
    "format_label": "One coding problem with follow-up questions (Google-style)",
    "estimated_minutes": 45,
}


def default_template_for_company(company: str) -> InterviewTemplate:
    c = (company or "").lower()
    if any(k in c for k in ("google", "alphabet", "waymo", "deepmind")):
        return dict(_DEFAULT_GOOGLE)
    if any(k in c for k in ("amazon", "aws")):
        return {
            "format": "multi_problem",
            "primary_questions": 2,
            "follow_ups_per_problem": 0,
            "format_label": "Two coding problems (Amazon-style)",
            "estimated_minutes": 60,
        }
    if any(k in c for k in ("meta", "facebook")):
        return {
            "format": "multi_problem",
            "primary_questions": 2,
            "follow_ups_per_problem": 1,
            "format_label": "Two problems with optional follow-up (Meta-style)",
            "estimated_minutes": 55,
        }
    return dict(_DEFAULT_MULTI)


def normalize_template(raw: dict | None, company: str = "") -> InterviewTemplate:
    """Merge LLM / cache output with sane defaults."""
    base = default_template_for_company(company)
    if not raw:
        return base

    fmt = (raw.get("format") or base["format"]).strip().lower()
    if fmt not in ("one_problem_followups", "multi_problem"):
        fmt = base["format"]

    primary = int(raw.get("primary_questions") or base.get("primary_questions", 1))
    follow = int(raw.get("follow_ups_per_problem") or base.get("follow_ups_per_problem", 0))
    primary = max(1, min(primary, 4))
    follow = max(0, min(follow, 4))

    if fmt == "one_problem_followups":
        primary = 1
        follow = max(1, follow)

    label = (raw.get("format_label") or "").strip()
    if not label:
        if fmt == "one_problem_followups":
            label = f"One problem + {follow} follow-up(s)"
        else:
            label = f"{primary} coding problem(s)"

    minutes = int(raw.get("estimated_minutes") or base.get("estimated_minutes", 45))

    return {
        "format": fmt,
        "primary_questions": primary,
        "follow_ups_per_problem": follow,
        "format_label": label,
        "estimated_minutes": minutes,
    }


def total_turns(template: InterviewTemplate) -> int:
    fmt = template.get("format", "multi_problem")
    primary = template.get("primary_questions", config.CALIBRATION_QUESTION_COUNT)
    follow = template.get("follow_ups_per_problem", 0)
    if fmt == "one_problem_followups":
        return primary + follow
    return primary + (primary * follow if follow else 0)


def topics_for_template(template: InterviewTemplate, key_topics: list[str]) -> list[str]:
    """Pick how many topics to use for this session."""
    n = total_turns(template)
    fmt = template.get("format", "multi_problem")
    if fmt == "one_problem_followups":
        return key_topics[:1] if key_topics else key_topics
    primary = template.get("primary_questions", config.CALIBRATION_QUESTION_COUNT)
    return key_topics[: max(primary, min(n, len(key_topics) or primary))]

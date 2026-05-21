from typing import Annotated, TypedDict
from langgraph.graph.message import add_messages


class CoachTurn(TypedDict, total=False):
    mode: str
    content: str
    reply: str


class TopicRecord(TypedDict):
    topic: str
    attempt: int
    question: str
    answer: str
    raw_score: float          # 0-100, from Evaluation Agent
    score: float              # 0-100, final after Critique Agent may adjust
    feedback: str             # final published feedback
    critique_notes: str       # what the Critique Agent changed (internal)
    passed: bool
    interview_phase: str      # primary | follow_up
    coach_messages: list      # coach exchanges during this turn


class InterviewState(TypedDict):
    # ── Session identity ──────────────────────────────────────────────────────
    session_id: str
    user_id: str              # name entered at start; key for history lookup
    company: str
    role: str
    coding_language: str       # requested language: "python" | "javascript" | "typescript" etc.

    # ── Candidate historical profile (loaded at session start) ────────────────
    # Shape: { topic: { avg_score, last_score, attempts, trend, performance_level } }
    candidate_profile: dict

    # ── Research phase ────────────────────────────────────────────────────────
    research_results: str     # synthesised narrative from Research Agent
    research_attempts: int
    research_quality: str     # "thin" | "good" | "excellent"
    interview_type: str       # "ml_focused" | "behavioral" | "technical" | "general"
    interview_template: dict  # format, primary_questions, follow_ups_per_problem, ...

    # ── Interview topics (set by Research Agent; calibration uses first N) ──
    interview_topics: list[str]
    interview_phase: str      # primary | follow_up
    primary_question_stem: str  # original problem (for follow-ups)
    current_topic_index: int
    questions_answered: int       # calibration progress (0..CALIBRATION_QUESTION_COUNT)
    research_from_cache: bool
    calibration_questions_asked: list[str]  # prior problem stems to avoid duplicates

    # ── Current Q&A turn ─────────────────────────────────────────────────────
    current_question: str
    question_difficulty: str  # "easy" | "medium" | "hard" — set by Orchestrator
    follow_up_context: str

    # ── User answer ───────────────────────────────────────────────────────────
    user_answer: str
    coach_messages: list      # current-turn coach log (cleared each new question)

    # ── Evaluation (raw, before Critique Agent reviews it) ───────────────────
    evaluation_score: float       # 0–100, raw from Evaluation Agent
    evaluation_feedback: str      # raw feedback string
    evaluation_raw: str           # full raw JSON string from Evaluation Agent

    # ── Critique (Evaluation quality-gate output) ────────────────────────────
    critique_adjusted_score: float    # final score (may equal evaluation_score)
    critique_feedback: str            # final published feedback shown to user
    critique_notes: str               # what the Critique Agent changed and why

    # ── Topic tracking ────────────────────────────────────────────────────────
    topic_attempts: dict          # { topic: attempt_count }
    passed_topics: list[str]
    skipped_topics: list[str]
    topic_history: list[TopicRecord]

    # ── Orchestrator routing ──────────────────────────────────────────────────
    next_action: str              # "research" | "interview" | "session_review" | "end"
    orchestrator_notes: str

    # ── Final session output (filled by Session Review Agent) ────────────────
    session_summary: str
    study_recommendations: list[str]

    # ── Message history (for LangGraph tracing) ───────────────────────────────
    messages: Annotated[list, add_messages]

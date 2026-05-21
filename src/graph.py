"""LangGraph workflow — supervisor pattern.

Entry point: START → orchestrator
The orchestrator dispatches to any agent via tool-calls and is the hub that
all agents report back to (except the interview→evaluation→critique pipeline,
which is a fixed sub-chain).

Graph shape:
  START → orchestrator
  orchestrator →(conditional)→ research | interview | session_review | END
  research → orchestrator
  interview_generate → interview_collect (interrupt) → evaluation → critique → orchestrator
  session_review → save_history → END
"""
import sqlite3

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.sqlite import SqliteSaver

from src.state import InterviewState
from src.agents.research_agent import research_node
from src.agents.orchestrator import orchestrator_node, route_after_orchestrator
from src.agents.interview_agent import generate_question_node, collect_answer_node
from src.agents.evaluation_agent import evaluation_node
from src.agents.critic_agent import critique_node
from src.agents.session_review_agent import session_review_node
from src.memory.history import save_session_results
from src.config import config


def save_history_node(state: InterviewState) -> dict:
    """Persist all topic results to the cross-session history store."""
    user_id = state.get("user_id", "anonymous")
    session_id = state.get("session_id", "unknown")
    company = state.get("company", "")
    role = state.get("role", "")
    history = state.get("topic_history", [])

    if history:
        try:
            save_session_results(user_id, session_id, company, role, history)
        except Exception:
            pass  # history persistence failure should never crash the session

    return {}


def build_graph():
    """Construct and compile the interview prep supervisor graph."""
    builder = StateGraph(InterviewState)

    # ── Register nodes ────────────────────────────────────────────────────────
    builder.add_node("orchestrator",    orchestrator_node)
    builder.add_node("research",        research_node)
    builder.add_node("interview_generate", generate_question_node)
    builder.add_node("interview_collect",  collect_answer_node)  # interrupt()
    builder.add_node("evaluation",      evaluation_node)
    builder.add_node("critique",        critique_node)
    builder.add_node("session_review",  session_review_node)
    builder.add_node("save_history",    save_history_node)

    # ── Edges ─────────────────────────────────────────────────────────────────

    # Orchestrator is the sole entry point
    builder.add_edge(START, "orchestrator")

    # Orchestrator routes to any agent
    builder.add_conditional_edges(
        "orchestrator",
        route_after_orchestrator,
        {
            "research":       "research",
            "interview":      "interview_generate",
            "session_review": "session_review",
            "__end__":        END,
        },
    )

    # All "worker" agents report back to orchestrator
    builder.add_edge("research",  "orchestrator")

    # Interview → fixed evaluation pipeline → back to orchestrator
    builder.add_edge("interview_generate", "interview_collect")
    builder.add_edge("interview_collect",  "evaluation")
    builder.add_edge("evaluation", "critique")
    builder.add_edge("critique",   "orchestrator")

    # Session review → persist history → done
    builder.add_edge("session_review", "save_history")
    builder.add_edge("save_history",   END)

    # ── Persistent checkpointing via SQLite ───────────────────────────────────
    conn = sqlite3.connect(config.DB_PATH, check_same_thread=False)
    checkpointer = SqliteSaver(conn)

    return builder.compile(checkpointer=checkpointer)


_graph = None


def get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph

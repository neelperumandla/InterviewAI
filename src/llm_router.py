from langchain_google_genai import ChatGoogleGenerativeAI
from src.config import config


_MODEL_ROUTING: dict[str, str] = {
    # Routing decisions are fast; Flash is more than sufficient and keeps costs low
    "orchestrator": "gemini-2.5-flash",
    # Processes large web-search payloads; speed and context window matter more than depth
    "research":     "gemini-2.5-flash",
    # Latency-sensitive conversational question generation; Flash keeps UX snappy
    "interview":    "gemini-2.5-flash",
    # Nuanced technical scoring demands the best available reasoning to be fair and accurate
    "evaluation":   "gemini-2.5-pro",
    # Quality-gating the evaluation output requires comparable judgment to the evaluator itself
    "critic":       "gemini-2.5-pro",
    # Session summary and history ops are lightweight; Flash-lite stays comfortably in free tier
    "memory":       "gemini-2.5-flash-lite",
}

_TEMPERATURES: dict[str, float] = {
    "orchestrator": 0.0,
    "research":     0.0,
    "interview":    0.7,   # some variation keeps questions fresh across retries
    "evaluation":   0.0,
    "critic":       0.0,
    "memory":       0.3,
}


def get_llm_for_agent(agent_name: str) -> ChatGoogleGenerativeAI:
    """Return a configured Gemini model instance for the given agent name.

    Centralises all model routing so changing a model only requires editing
    _MODEL_ROUTING above — no agent file needs to be touched.
    """
    return ChatGoogleGenerativeAI(
        model=_MODEL_ROUTING.get(agent_name, "gemini-2.5-flash"),
        google_api_key=config.gemini_key_for_agent(agent_name),
        temperature=_TEMPERATURES.get(agent_name, 0.0),
    )

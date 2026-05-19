"""Centralised model + rate-limit router for all agents.

Why this file exists:
- Every agent gets its Gemini client from here, so swapping a model only
  touches `_DEFAULT_MODELS` (or the corresponding env var).
- A per-agent token-bucket rate limiter keeps us inside Gemini's free-tier
  request-per-minute quotas. Pro is throttled hardest because its free RPM
  is the lowest (typically ~5 RPM and as low as 0 once daily quota is hit).
- Clients are cached per agent so the rate-limiter bucket persists across
  successive calls — without caching, every call would get a fresh bucket
  and the throttle would be useless.

Env-var overrides (all optional):
  MODEL_<AGENT>   — e.g. MODEL_EVALUATION=gemini-2.5-flash to downgrade Pro
  TEMP_<AGENT>    — float, default per agent
  RPM_<AGENT>     — requests-per-minute cap for this agent's bucket

<AGENT> is one of: ORCHESTRATOR, RESEARCH, INTERVIEW, EVALUATION, CRITIC, MEMORY.
"""
import os
from functools import lru_cache

from langchain_core.rate_limiters import InMemoryRateLimiter
from langchain_google_genai import ChatGoogleGenerativeAI

from src.config import config


_DEFAULT_MODELS: dict[str, str] = {
    # Routing decisions are fast; Flash is more than sufficient and keeps costs low
    "orchestrator": "gemini-2.5-flash",
    # Processes large web-search payloads; speed and context window matter more than depth
    "research":     "gemini-2.5-flash",
    # Latency-sensitive conversational question generation; Flash keeps UX snappy
    "interview":    "gemini-2.5-flash",
    # Was gemini-2.5-pro for max reasoning quality, but Pro's free-tier RPM/daily
    # caps are extremely tight; Flash is a workable fallback for scoring.
    "evaluation":   "gemini-2.5-flash",
    # Was gemini-2.5-pro to match the evaluator's judgment, but Pro's free-tier
    # caps make it unreliable in this pipeline; Flash handles the QA review fine.
    "critic":       "gemini-2.5-flash",
    # Session summary and history ops are lightweight; Flash-lite stays comfortably in free tier
    "memory":       "gemini-2.5-flash-lite",
}

_DEFAULT_TEMPERATURES: dict[str, float] = {
    "orchestrator": 0.0,
    "research":     0.0,
    "interview":    0.7,   # some variation keeps questions fresh across retries
    "evaluation":   0.0,
    "critic":       0.0,
    "memory":       0.3,
}

# Conservative per-agent RPM caps. Gemini free-tier ceilings (subject to change):
#   gemini-2.5-flash-lite ~15 RPM
#   gemini-2.5-flash       ~10 RPM
#   gemini-2.5-pro          ~5 RPM (often less for newer projects)
# We undershoot these on purpose to leave headroom for token-per-minute quotas
# and for the langchain-side retries on transient failures. Bump these up in
# .env if you have paid quota.
_DEFAULT_RPM: dict[str, float] = {
    "orchestrator": 6.0,
    "research":     5.0,
    "interview":    6.0,
    "evaluation":   6.0,   # on Flash by default; bump down if you switch back to Pro
    "critic":       6.0,   # on Flash by default; bump down if you switch back to Pro
    "memory":       8.0,
}


def _env_float(name: str, fallback: float) -> float:
    raw = os.getenv(name)
    if not raw:
        return fallback
    try:
        return float(raw)
    except ValueError:
        return fallback


def _resolve_model(agent: str) -> str:
    return os.getenv(f"MODEL_{agent.upper()}", _DEFAULT_MODELS.get(agent, "gemini-2.5-flash"))


def _resolve_temperature(agent: str) -> float:
    return _env_float(f"TEMP_{agent.upper()}", _DEFAULT_TEMPERATURES.get(agent, 0.0))


def _resolve_rpm(agent: str) -> float:
    return _env_float(f"RPM_{agent.upper()}", _DEFAULT_RPM.get(agent, 6.0))


@lru_cache(maxsize=None)
def get_llm_for_agent(agent_name: str) -> ChatGoogleGenerativeAI:
    """Return a per-agent, rate-limited Gemini client.

    Cached: every caller of a given agent shares the same client *and* the
    same rate-limiter bucket, so concurrent sessions cooperate instead of
    racing into 429s.
    """
    rpm = _resolve_rpm(agent_name)
    # Refill at rpm/60 tokens per second; allow a tiny burst so two
    # back-to-back invocations don't always stall, while still tracking the
    # long-term average.
    rate_limiter = InMemoryRateLimiter(
        requests_per_second=max(rpm / 60.0, 0.05),
        check_every_n_seconds=0.25,
        max_bucket_size=max(1.0, rpm / 6.0),
    )

    return ChatGoogleGenerativeAI(
        model=_resolve_model(agent_name),
        google_api_key=config.gemini_key_for_agent(agent_name),
        temperature=_resolve_temperature(agent_name),
        rate_limiter=rate_limiter,
        # Cap retries — the rate limiter should prevent 429s in the first place.
        max_retries=2,
    )

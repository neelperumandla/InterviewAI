import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    # Per-agent Gemini API keys (set in .env.example)
    GEMINI_API_KEY_ORCHESTRATOR: str = os.getenv("GEMINI_API_KEY_ORCHESTRATOR", "")
    GEMINI_API_KEY_RESEARCH: str = os.getenv("GEMINI_API_KEY_RESEARCH", "")
    GEMINI_API_KEY_INTERVIEW: str = os.getenv("GEMINI_API_KEY_INTERVIEW", "")
    GEMINI_API_KEY_EVALUATION: str = os.getenv("GEMINI_API_KEY_EVALUATION", "")
    GEMINI_API_KEY_CRITIC: str = os.getenv("GEMINI_API_KEY_CRITIC", "")
    GEMINI_API_KEY_MEMORY: str = os.getenv("GEMINI_API_KEY_MEMORY", "")

    # Backwards-compatible fallback key (optional)
    GEMINI_API_KEY_FALLBACK: str = os.getenv("GEMINI_API_KEY", "")
    TAVILY_API_KEY: str = os.getenv("TAVILY_API_KEY", "")

    # Research thresholds
    RESEARCH_MAX_RETRIES: int = int(os.getenv("RESEARCH_MAX_RETRIES", "2"))
    RESEARCH_CACHE_DAYS: int = int(os.getenv("RESEARCH_CACHE_DAYS", "30"))

    # Calibration: fixed number of skill-gauging questions per session
    CALIBRATION_QUESTION_COUNT: int = int(os.getenv("CALIBRATION_QUESTION_COUNT", "3"))

    # Scoring thresholds (0-100 scale)
    PASS_SCORE_THRESHOLD: float = float(os.getenv("PASS_SCORE_THRESHOLD", "60.0"))
    MAX_TOPIC_ATTEMPTS: int = int(os.getenv("MAX_TOPIC_ATTEMPTS", "1"))

    # SQLite DB for LangGraph checkpointing
    DB_PATH: str = os.getenv("DB_PATH", "interview_memory.db")

    # SQLite DB for cross-session candidate history
    HISTORY_DB_PATH: str = os.getenv("HISTORY_DB_PATH", "candidate_history.db")

    # API server settings
    API_HOST: str = os.getenv("API_HOST", "0.0.0.0")
    API_PORT: int = int(os.getenv("API_PORT", "8001"))

    @classmethod
    def validate(cls) -> None:
        missing = []
        # If per-agent keys are missing, fall back to GEMINI_API_KEY.
        required = {
            "GEMINI_API_KEY_ORCHESTRATOR": cls.GEMINI_API_KEY_ORCHESTRATOR,
            "GEMINI_API_KEY_RESEARCH": cls.GEMINI_API_KEY_RESEARCH,
            "GEMINI_API_KEY_INTERVIEW": cls.GEMINI_API_KEY_INTERVIEW,
            "GEMINI_API_KEY_EVALUATION": cls.GEMINI_API_KEY_EVALUATION,
            "GEMINI_API_KEY_CRITIC": cls.GEMINI_API_KEY_CRITIC,
            "GEMINI_API_KEY_MEMORY": cls.GEMINI_API_KEY_MEMORY,
        }

        if not cls.GEMINI_API_KEY_FALLBACK:
            for name, value in required.items():
                if not value:
                    missing.append(name)
        if not cls.TAVILY_API_KEY:
            missing.append("TAVILY_API_KEY")
        if missing:
            raise EnvironmentError(
                f"Missing required environment variables: {', '.join(missing)}\n"
                "Copy .env.example to .env and fill in your keys."
            )

    @classmethod
    def gemini_key_for_agent(cls, agent_name: str) -> str:
        """Map an agent name to the configured Gemini API key."""
        agent_map = {
            "orchestrator": cls.GEMINI_API_KEY_ORCHESTRATOR,
            "research": cls.GEMINI_API_KEY_RESEARCH,
            "interview": cls.GEMINI_API_KEY_INTERVIEW,
            "evaluation": cls.GEMINI_API_KEY_EVALUATION,
            "critic": cls.GEMINI_API_KEY_CRITIC,
            "memory": cls.GEMINI_API_KEY_MEMORY,
        }
        return agent_map.get(agent_name, "") or cls.GEMINI_API_KEY_FALLBACK


config = Config()

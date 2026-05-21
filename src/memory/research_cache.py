"""Cached company/role research — skip Tavily + synthesis when fresh."""
import json
import sqlite3
from datetime import datetime, timedelta, timezone

from src.config import config


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(config.HISTORY_DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_research_cache_db() -> None:
    conn = _get_conn()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS company_research (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            company_key     TEXT NOT NULL,
            role_key        TEXT NOT NULL,
            summary         TEXT NOT NULL,
            interview_type  TEXT NOT NULL,
            topics_json     TEXT NOT NULL,
            quality         TEXT NOT NULL,
            researched_at   TEXT NOT NULL,
            UNIQUE(company_key, role_key)
        )
    """)
    conn.commit()
    conn.close()


def _keys(company: str, role: str) -> tuple[str, str]:
    return company.strip().lower(), role.strip().lower()


def get_cached_research(company: str, role: str) -> dict | None:
    """Return cached research if younger than RESEARCH_CACHE_DAYS."""
    init_research_cache_db()
    ck, rk = _keys(company, role)
    conn = _get_conn()
    row = conn.execute(
        """
        SELECT summary, interview_type, topics_json, quality, researched_at
        FROM company_research
        WHERE company_key = ? AND role_key = ?
        """,
        (ck, rk),
    ).fetchone()
    conn.close()
    if not row:
        return None

    researched_at = datetime.fromisoformat(row["researched_at"])
    if researched_at.tzinfo is None:
        researched_at = researched_at.replace(tzinfo=timezone.utc)
    age = datetime.now(timezone.utc) - researched_at
    if age > timedelta(days=config.RESEARCH_CACHE_DAYS):
        return None

    try:
        topics = json.loads(row["topics_json"])
    except json.JSONDecodeError:
        topics = []

    return {
        "summary": row["summary"],
        "interview_type": row["interview_type"],
        "topics": topics,
        "quality": row["quality"],
        "researched_at": row["researched_at"],
        "cache_age_days": age.days,
    }


def save_research_cache(
    company: str,
    role: str,
    summary: str,
    interview_type: str,
    topics: list[str],
    quality: str,
) -> None:
    init_research_cache_db()
    ck, rk = _keys(company, role)
    conn = _get_conn()
    conn.execute(
        """
        INSERT INTO company_research
            (company_key, role_key, summary, interview_type, topics_json, quality, researched_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(company_key, role_key) DO UPDATE SET
            summary = excluded.summary,
            interview_type = excluded.interview_type,
            topics_json = excluded.topics_json,
            quality = excluded.quality,
            researched_at = excluded.researched_at
        """,
        (
            ck,
            rk,
            summary,
            interview_type,
            json.dumps(topics),
            quality,
            datetime.now(timezone.utc).isoformat(),
        ),
    )
    conn.commit()
    conn.close()

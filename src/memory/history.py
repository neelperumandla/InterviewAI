import sqlite3
from datetime import datetime

from src.config import config


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(config.HISTORY_DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_history_db() -> None:
    conn = _get_conn()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS topic_performance (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id         TEXT    NOT NULL,
            session_id      TEXT,
            timestamp       TEXT    NOT NULL,
            company         TEXT,
            role            TEXT,
            topic           TEXT    NOT NULL,
            score           REAL    NOT NULL,
            passed          INTEGER NOT NULL,
            question        TEXT,
            answer_summary  TEXT
        )
    """)
    conn.commit()
    conn.close()


def save_session_results(
    user_id: str,
    session_id: str,
    company: str,
    role: str,
    topic_history: list,
) -> None:
    init_history_db()
    conn = _get_conn()
    timestamp = datetime.now().isoformat()
    for record in topic_history:
        conn.execute(
            """
            INSERT INTO topic_performance
                (user_id, session_id, timestamp, company, role,
                 topic, score, passed, question, answer_summary)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                session_id,
                timestamp,
                company,
                role,
                record.get("topic", ""),
                record.get("score", 0.0),
                1 if record.get("passed") else 0,
                record.get("question", "")[:500],
                record.get("answer", "")[:500],
            ),
        )
    conn.commit()
    conn.close()


def get_candidate_profile(user_id: str) -> dict:
    """Return a per-topic performance profile for the given user.

    Returns empty dict if no history exists yet (first-time user).
    """
    init_history_db()
    conn = _get_conn()
    rows = conn.execute(
        """
        SELECT topic, score, passed, timestamp
        FROM topic_performance
        WHERE user_id = ?
        ORDER BY timestamp ASC
        """,
        (user_id,),
    ).fetchall()

    session_count = conn.execute(
        "SELECT COUNT(DISTINCT session_id) FROM topic_performance WHERE user_id = ?",
        (user_id,),
    ).fetchone()[0]
    conn.close()

    if not rows:
        return {"user_id": user_id, "topics": {}, "total_sessions": 0}

    raw: dict[str, dict] = {}
    for row in rows:
        topic = row["topic"]
        if topic not in raw:
            raw[topic] = {"scores": [], "passed": 0, "failed": 0}
        raw[topic]["scores"].append(row["score"])
        if row["passed"]:
            raw[topic]["passed"] += 1
        else:
            raw[topic]["failed"] += 1

    profile_topics: dict = {}
    for topic, data in raw.items():
        scores = data["scores"]
        avg = sum(scores) / len(scores)

        # Trend: compare last 3 attempts vs the ones before
        if len(scores) >= 4:
            recent = sum(scores[-3:]) / 3
            earlier = sum(scores[:-3]) / len(scores[:-3])
            if recent > earlier + 5:
                trend = "improving"
            elif recent < earlier - 5:
                trend = "declining"
            else:
                trend = "stable"
        else:
            trend = "new"

        if avg >= 75:
            level = "strong"
        elif avg >= 55:
            level = "moderate"
        else:
            level = "weak"

        profile_topics[topic] = {
            "avg_score": round(avg, 1),
            "last_score": scores[-1],
            "attempts": len(scores),
            "passed_count": data["passed"],
            "failed_count": data["failed"],
            "trend": trend,
            "performance_level": level,
        }

    return {
        "user_id": user_id,
        "topics": profile_topics,
        "total_sessions": session_count,
    }

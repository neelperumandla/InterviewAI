"""FastAPI backend — WebSocket-driven LangGraph session server.

WebSocket endpoint: ws://localhost:<API_PORT>/ws/{session_id}

UI on the same port: run ``cd frontend && npm run build``, then open
http://localhost:<API_PORT>/ — the built app loads ``/assets/*.js`` here.
Dev with HMR: ``npm run dev`` in ``frontend/`` → http://localhost:5173 only.

Protocol
--------
Client → Server:
  { "type": "start",  "name": "...", "company": "...", "role": "..." }
  { "type": "answer", "content": "..." }

Server → Client:
  { "type": "status",         "message": "Researching Google..." }
  { "type": "research_done",  "data": { quality, topics, interview_type, summary } }
  { "type": "question",       "data": { topic, question, attempt, max_attempts, difficulty } }
  { "type": "evaluation",     "data": { score, feedback, critique_notes, passed } }
  { "type": "orchestrator",   "data": { notes } }
  { "type": "session_review", "data": { overall_score, tier, summary, recommendations, raw } }
  { "type": "error",          "message": "..." }
  { "type": "done" }
"""
import asyncio
import json
import queue
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from langgraph.types import Command
from starlette.websockets import WebSocketState

from src.config import config
from src.graph import get_graph
from src.memory.history import get_candidate_profile

_FRONTEND_DIST = Path(__file__).resolve().parent / "frontend" / "dist"

_NOT_BUILT_HTML = """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Interview Prep AI — API</title></head>
<body style="font-family:system-ui,sans-serif;max-width:40rem;margin:2rem;line-height:1.5">
<h1>API is running</h1>
<p>The browser UI is not built yet for this port. Dev mode uses Vite, which serves
<code>/src/main.tsx</code> and <code>/@vite/client</code> — those URLs only work on the Vite dev server.</p>
<p><strong>Option A — dev (hot reload):</strong><br/>
<code>cd frontend && npm run dev</code> → open <a href="http://127.0.0.1:5173">http://127.0.0.1:5173</a></p>
<p><strong>Option B — same port as API:</strong><br/>
<code>cd frontend && npm run build</code> then restart <code>python main.py</code> → reload this page.</p>
</body></html>"""


@asynccontextmanager
async def _lifespan(app: FastAPI):
    port = config.API_PORT
    if (_FRONTEND_DIST / "index.html").is_file():
        print(f"Interview Prep AI — UI + API: http://127.0.0.1:{port}/")
    else:
        print(
            f"Interview Prep AI — API on port {port}. UI: "
            f"http://127.0.0.1:5173 (npm run dev) or build frontend then http://127.0.0.1:{port}/"
        )
    yield


app = FastAPI(title="Interview Prep AI", lifespan=_lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_assets_dir = _FRONTEND_DIST / "assets"
if _assets_dir.is_dir():
    app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="frontend_assets")


# ── Graph runner helpers ──────────────────────────────────────────────────────

def _graph_worker(
    input_data: Any,
    thread_config: dict,
    out_q: queue.Queue,
) -> None:
    """Run the graph in a background thread, pushing state snapshots as each node finishes."""
    graph = get_graph()
    latest_state: dict = {}
    error_message: str | None = None

    try:
        for event in graph.stream(input_data, thread_config, stream_mode="values"):
            latest_state = event
            out_q.put(("progress", dict(event)))
    except Exception as e:
        error_message = f"{type(e).__name__}: {e}"
        print(f"[graph] error: {error_message}")

    interrupted_value: dict | None = None
    snap = graph.get_state(thread_config)
    if snap and snap.tasks:
        for task in snap.tasks:
            if task.interrupts:
                interrupted_value = task.interrupts[0].value
                break
    if snap:
        latest_state = snap.values

    out_q.put(("finished", latest_state, interrupted_value, error_message))


async def _run_graph_streaming(
    ws: WebSocket,
    input_data: Any,
    thread_config: dict,
    prev_state: dict,
) -> tuple[dict, dict | None, str | None]:
    """Run the graph while streaming partial state to the client after each node.

    This is critical for answer submission: feedback is sent as soon as the
    critique node completes, *before* the orchestrator and next question run.
    Otherwise the socket sits silent for 30–90s and proxies/clients drop it.
    """
    out_q: queue.Queue = queue.Queue()
    thread = threading.Thread(
        target=_graph_worker,
        args=(input_data, thread_config, out_q),
        daemon=True,
    )
    thread.start()

    current_prev = dict(prev_state)
    latest_state: dict = {}
    interrupted_value: dict | None = None
    error_message: str | None = None

    while True:
        item = await asyncio.to_thread(out_q.get)
        kind = item[0]

        if kind == "progress":
            new_state = item[1]
            await _broadcast_state_events(ws, current_prev, new_state)
            current_prev = new_state
            latest_state = new_state
            continue

        if kind == "finished":
            latest_state = item[1]
            interrupted_value = item[2]
            error_message = item[3]
            # Final diff in case the last transition wasn't streamed
            await _broadcast_state_events(ws, current_prev, latest_state)
            if interrupted_value:
                await _send(ws, {"type": "question", "data": interrupted_value})
            elif error_message:
                await _send(ws, {"type": "error", "message": error_message})
            break

    thread.join(timeout=1.0)
    return latest_state, interrupted_value, error_message


# ── WebSocket event senders ───────────────────────────────────────────────────

async def _send(ws: WebSocket, msg: dict) -> bool:
    """Send JSON over the WebSocket. Returns False if the socket is gone."""
    if ws.client_state != WebSocketState.CONNECTED:
        return False
    try:
        await ws.send_text(json.dumps(msg, ensure_ascii=False))
        return True
    except (WebSocketDisconnect, RuntimeError, ConnectionError):
        return False
    except Exception as e:
        # Log but don't tear down the handler — one bad payload shouldn't kill the session.
        print(f"[ws] send failed ({msg.get('type')}): {e}")
        return False


def _question_payload_from_state(state: dict) -> dict | None:
    """Build the WS question payload from graph state."""
    question = (state.get("current_question") or "").strip()
    if not question:
        return None
    topics = state.get("interview_topics", [])
    idx = state.get("current_topic_index", 0)
    topic = topics[idx] if idx < len(topics) else ""
    attempts = state.get("topic_attempts", {})
    return {
        "topic": topic,
        "question": question,
        "attempt": attempts.get(topic, 1),
        "max_attempts": config.MAX_TOPIC_ATTEMPTS,
        "difficulty": state.get("question_difficulty", "medium"),
    }


def _final_score(state: dict) -> float | None:
    """Score for the UI — orchestrator may clear critique_adjusted_score before we broadcast."""
    score = state.get("critique_adjusted_score")
    if score is not None:
        return score
    history = state.get("topic_history") or []
    if history:
        return history[-1].get("score")
    return state.get("evaluation_score")


async def _broadcast_state_events(
    ws: WebSocket,
    prev_state: dict,
    new_state: dict,
) -> None:
    """Diff old vs new state and push appropriate events to the client."""

    # Research completed
    if new_state.get("research_quality") and not prev_state.get("research_quality"):
        await _send(ws, {
            "type": "research_done",
            "data": {
                "quality":        new_state.get("research_quality"),
                "topics":         new_state.get("interview_topics", []),
                "interview_type": new_state.get("interview_type"),
                "summary":        new_state.get("research_results", ""),
                "from_cache":     bool(new_state.get("research_from_cache")),
            },
        })
        n = min(config.CALIBRATION_QUESTION_COUNT, len(new_state.get("interview_topics", [])))
        await _send(ws, {
            "type": "status",
            "message": (
                f"Research ready — generating question 1 of {n} "
                "(this usually takes 10–30 seconds)…"
            ),
        })

    # New calibration question generated — push immediately (don't wait for graph end)
    prev_q = (prev_state.get("current_question") or "").strip()
    new_q = (new_state.get("current_question") or "").strip()
    if new_q and new_q != prev_q:
        payload = _question_payload_from_state(new_state)
        if payload:
            answered = new_state.get("questions_answered", 0)
            await _send(ws, {"type": "question", "data": payload})
            await _send(ws, {
                "type": "status",
                "message": f"Question {answered + 1} ready.",
            })

    # Critique result published (evaluation + critique both done)
    if (
        new_state.get("critique_feedback")
        and new_state.get("critique_feedback") != prev_state.get("critique_feedback")
    ):
        score = _final_score(new_state)
        history = new_state.get("topic_history") or []
        record = history[-1] if history else {}
        await _send(ws, {
            "type": "evaluation",
            "data": {
                "topic":          record.get("topic", ""),
                "attempt":        record.get("attempt", 1),
                "question":       record.get("question", new_state.get("current_question", "")),
                "score":          score,
                "raw_score":      new_state.get("evaluation_score"),
                "feedback":       new_state.get("critique_feedback"),
                "critique_notes": new_state.get("critique_notes", ""),
                "passed":         (score or 0) >= config.PASS_SCORE_THRESHOLD,
            },
        })
        answered = new_state.get("questions_answered", 0)
        n = config.CALIBRATION_QUESTION_COUNT
        if answered < n:
            await _send(ws, {
                "type": "status",
                "message": (
                    f"Feedback ready. Generating question {answered + 1} of {n}…"
                ),
            })
        else:
            await _send(ws, {
                "type": "status",
                "message": "Feedback ready. Preparing session summary…",
            })

    # Orchestrator decision note (short routing reasons only — not session JSON)
    if (
        new_state.get("orchestrator_notes")
        and new_state.get("orchestrator_notes") != prev_state.get("orchestrator_notes")
    ):
        notes = new_state.get("orchestrator_notes", "")
        if notes and len(notes) < 2000 and not notes.strip().startswith("{"):
            await _send(ws, {
                "type": "orchestrator",
                "data": {"notes": notes},
            })

    # Session review completed
    if new_state.get("session_summary") and not prev_state.get("session_summary"):
        raw = new_state.get("orchestrator_notes", "")
        try:
            parsed = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            parsed = {}
        await _send(ws, {
            "type": "session_review",
            "data": {
                "overall_score":     parsed.get("overall_score"),
                "tier":              parsed.get("performance_tier"),
                "summary":           new_state.get("session_summary"),
                "key_strengths":     parsed.get("key_strengths", []),
                "key_gaps":          parsed.get("key_gaps", []),
                "recommendations":   new_state.get("study_recommendations", []),
                "next_steps":        parsed.get("next_steps", ""),
                "topic_history":     new_state.get("topic_history", []),
                "passed_topics":     new_state.get("passed_topics", []),
                "skipped_topics":    new_state.get("skipped_topics", []),
            },
        })


async def _run_periodic_status(
    ws: WebSocket,
    cancel: asyncio.Event,
    base_message: str,
    interval: float = 12.0,
) -> None:
    """Keep the connection alive with status pings while the graph runs."""
    elapsed = 0
    try:
        while not cancel.is_set():
            await asyncio.sleep(interval)
            if cancel.is_set():
                return
            elapsed += int(interval)
            if not await _send(ws, {
                "type": "status",
                "message": f"{base_message} ({elapsed}s)…",
            }):
                return
    except asyncio.CancelledError:
        return


# ── WebSocket handler ─────────────────────────────────────────────────────────

@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str) -> None:
    await websocket.accept()

    thread_config = {"configurable": {"thread_id": session_id}}
    prev_state: dict = {}

    try:
        while True:
            raw = await websocket.receive_text()
            message = json.loads(raw)
            msg_type = message.get("type")

            # ── Session start ─────────────────────────────────────────────────
            if msg_type == "start":
                name = message.get("name", "candidate").strip()
                company = message.get("company", "").strip()
                role = message.get("role", "").strip()
                coding_language = message.get("codingLanguage", "python").strip().lower()

                await _send(ws=websocket, msg={
                    "type": "status",
                    "message": "Loading your profile and starting session...",
                })

                candidate_profile = await asyncio.to_thread(
                    get_candidate_profile, name.lower()
                )

                initial_state = {
                    "session_id":             session_id,
                    "user_id":                name.lower(),
                    "company":                company,
                    "role":                   role,
                    "coding_language":        coding_language,
                    "candidate_profile":      candidate_profile,
                    "research_results":       "",
                    "research_attempts":      0,
                    "research_quality":       "",
                    "interview_type":         "general",
                    "interview_topics":       [],
                    "current_topic_index":    0,
                    "questions_answered":     0,
                    "research_from_cache":    False,
                    "current_question":       "",
                    "question_difficulty":    "medium",
                    "follow_up_context":      "",
                    "user_answer":            "",
                    "evaluation_score":       None,
                    "evaluation_feedback":    "",
                    "evaluation_raw":         "",
                    "critique_adjusted_score": None,
                    "critique_feedback":      "",
                    "critique_notes":         "",
                    "topic_attempts":         {},
                    "passed_topics":          [],
                    "skipped_topics":         [],
                    "topic_history":          [],
                    "next_action":            "",
                    "orchestrator_notes":     "",
                    "session_summary":        "",
                    "study_recommendations":  [],
                    "messages":               [],
                }

                await _send(ws=websocket, msg={
                    "type": "status",
                    "message": f"Session started. Researching {company} for {role}...",
                })

                status_cancel = asyncio.Event()
                status_task = asyncio.create_task(
                    _run_periodic_status(
                        websocket, status_cancel,
                        "Research is still running (this can take a bit)",
                    )
                )
                try:
                    new_state, interrupt_val, error_message = await _run_graph_streaming(
                        websocket, initial_state, thread_config, prev_state,
                    )
                finally:
                    status_cancel.set()
                    status_task.cancel()
                    try:
                        await status_task
                    except asyncio.CancelledError:
                        pass

                if error_message:
                    await _send(websocket, {
                        "type": "error",
                        "message": f"Session failed: {error_message}",
                    })
                    continue
                prev_state = new_state
                if new_state.get("session_summary"):
                    await _send(websocket, {"type": "done"})

            # ── Candidate answer ──────────────────────────────────────────────
            elif msg_type == "answer":
                answer = message.get("content", "").strip()
                if not answer:
                    answer = "[No answer provided]"

                # Reject answers meant for a different turn (stale UI / wrong tab).
                rejected = False
                graph = get_graph()
                snap = graph.get_state(thread_config)
                if snap and snap.tasks:
                    for task in snap.tasks:
                        if not task.interrupts:
                            continue
                        expected = task.interrupts[0].value or {}
                        client_topic = message.get("topic", "")
                        client_attempt = message.get("attempt")
                        if client_topic and expected.get("topic") != client_topic:
                            await _send(websocket, {
                                "type": "error",
                                "message": (
                                    "That answer does not match the open question. "
                                    "Switch to the latest problem (●) and submit again."
                                ),
                            })
                            rejected = True
                            break
                        if client_attempt is not None and expected.get("attempt") != client_attempt:
                            await _send(websocket, {
                                "type": "error",
                                "message": (
                                    "That answer is for a different attempt. "
                                    "Use the latest open question and submit again."
                                ),
                            })
                            rejected = True
                            break
                if rejected:
                    continue

                await _send(websocket, {
                    "type": "status",
                    "message": "Evaluating your answer...",
                })

                status_cancel = asyncio.Event()
                status_task = asyncio.create_task(
                    _run_periodic_status(
                        websocket, status_cancel,
                        "Still working (evaluation → critique → next question)",
                    )
                )
                try:
                    new_state, interrupt_val, error_message = await _run_graph_streaming(
                        websocket, Command(resume=answer), thread_config, prev_state,
                    )
                finally:
                    status_cancel.set()
                    status_task.cancel()
                    try:
                        await status_task
                    except asyncio.CancelledError:
                        pass

                if error_message:
                    await _send(websocket, {
                        "type": "error",
                        "message": f"Evaluation failed: {error_message}",
                    })
                    continue
                prev_state = new_state
                if new_state.get("session_summary"):
                    await _send(websocket, {"type": "done"})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[ws] handler error: {e}")
        await _send(websocket, {"type": "error", "message": str(e)})


# ── REST: session state snapshot ─────────────────────────────────────────────

@app.get("/api/sessions/{session_id}/state")
async def get_session_state(session_id: str) -> dict:
    graph = get_graph()
    thread_config = {"configurable": {"thread_id": session_id}}
    snap = graph.get_state(thread_config)
    if snap:
        return {"session_id": session_id, "state": snap.values}
    return {"session_id": session_id, "state": None}


@app.get("/", response_model=None)
async def serve_frontend_shell() -> Response:
    index = _FRONTEND_DIST / "index.html"
    if index.is_file():
        return FileResponse(index, media_type="text/html")
    return HTMLResponse(content=_NOT_BUILT_HTML, status_code=200)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


# ── Dev launcher ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    config.validate()
    uvicorn.run("api:app", host=config.API_HOST, port=config.API_PORT, reload=True)

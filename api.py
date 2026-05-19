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
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from langgraph.types import Command

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

def _run_graph_sync(
    input_data: Any, thread_config: dict
) -> tuple[dict, dict | None, str | None]:
    """Run the graph synchronously until an interrupt or natural end.

    Returns (latest_state, interrupt_value | None, error_message | None).
    """
    graph = get_graph()
    latest_state: dict = {}
    interrupted_value: dict | None = None
    error_message: str | None = None

    try:
        for event in graph.stream(input_data, thread_config, stream_mode="values"):
            latest_state = event
    except Exception as e:
        # Surface graph/runtime errors to the frontend.
        error_message = f"{type(e).__name__}: {e}"

    snap = graph.get_state(thread_config)
    if snap and snap.tasks:
        for task in snap.tasks:
            if task.interrupts:
                interrupted_value = task.interrupts[0].value
                break

    if snap:
        latest_state = snap.values

    return latest_state, interrupted_value, error_message


async def _run_graph(
    input_data: Any, thread_config: dict
) -> tuple[dict, dict | None, str | None]:
    """Async wrapper: runs sync graph code in a thread pool."""
    return await asyncio.to_thread(_run_graph_sync, input_data, thread_config)


# ── WebSocket event senders ───────────────────────────────────────────────────

async def _send(ws: WebSocket, msg: dict) -> None:
    await ws.send_text(json.dumps(msg))


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
            },
        })

    # Critique result published (evaluation + critique both done)
    if (
        new_state.get("critique_feedback")
        and new_state.get("critique_feedback") != prev_state.get("critique_feedback")
    ):
        raw_critic = new_state.get("orchestrator_notes", "")
        await _send(ws, {
            "type": "evaluation",
            "data": {
                "score":          new_state.get("critique_adjusted_score"),
                "raw_score":      new_state.get("evaluation_score"),
                "feedback":       new_state.get("critique_feedback"),
                "critique_notes": new_state.get("critique_notes", ""),
                "passed":         (new_state.get("critique_adjusted_score") or 0)
                                  >= config.PASS_SCORE_THRESHOLD,
            },
        })

    # Orchestrator decision note
    if (
        new_state.get("orchestrator_notes")
        and new_state.get("orchestrator_notes") != prev_state.get("orchestrator_notes")
    ):
        notes = new_state.get("orchestrator_notes", "")
        if notes and len(notes) < 2000:
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
                    "message": f"Loading your profile and starting session...",
                })

                # Load historical profile
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
                    "current_question":       "",
                    "coding_language":        coding_language,
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

                research_status_cancel = asyncio.Event()

                async def periodic_research_status() -> None:
                    try:
                        while not research_status_cancel.is_set():
                            await _send(websocket, {
                                "type": "status",
                                "message": "Research is still running (this can take a bit).",
                            })
                            await asyncio.sleep(15)
                    except asyncio.CancelledError:
                        # Expected when we cancel the periodic task after research ends.
                        return
                    except Exception:
                        # If the socket closes / send fails, just stop.
                        return

                status_task = asyncio.create_task(periodic_research_status())
                new_state, interrupt_val, error_message = await _run_graph(
                    initial_state, thread_config
                )
                research_status_cancel.set()
                status_task.cancel()
                try:
                    await status_task
                except asyncio.CancelledError:
                    # Expected cancellation.
                    pass
                except Exception:
                    pass

                if error_message:
                    await _send(websocket, {
                        "type": "error",
                        "message": f"Research failed: {error_message}",
                    })
                    continue
                await _broadcast_state_events(websocket, prev_state, new_state)
                prev_state = new_state

                if interrupt_val:
                    await _send(websocket, {"type": "question", "data": interrupt_val})
                elif new_state.get("session_summary"):
                    await _send(websocket, {"type": "done"})

            # ── Candidate answer ──────────────────────────────────────────────
            elif msg_type == "answer":
                answer = message.get("content", "").strip()
                if not answer:
                    answer = "[No answer provided]"

                await _send(websocket, {
                    "type": "status",
                    "message": "Evaluating your answer...",
                })

                # Heartbeat the client every 15s so it knows we're still working
                # (LLM retries or backoff can easily exceed the browser's idea of
                # "responsive"). Without this, a long evaluation looks like a
                # dead connection.
                eval_cancel = asyncio.Event()

                async def periodic_eval_status() -> None:
                    elapsed = 0
                    try:
                        while not eval_cancel.is_set():
                            await asyncio.sleep(15)
                            if eval_cancel.is_set():
                                return
                            elapsed += 15
                            try:
                                await _send(websocket, {
                                    "type": "status",
                                    "message": (
                                        f"Still evaluating ({elapsed}s)… the "
                                        "Critic Agent may be waiting on rate "
                                        "limits."
                                    ),
                                })
                            except Exception:
                                return
                    except asyncio.CancelledError:
                        return

                eval_status_task = asyncio.create_task(periodic_eval_status())
                try:
                    new_state, interrupt_val, error_message = await _run_graph(
                        Command(resume=answer), thread_config
                    )
                finally:
                    eval_cancel.set()
                    eval_status_task.cancel()
                    try:
                        await eval_status_task
                    except (asyncio.CancelledError, Exception):
                        pass

                if error_message:
                    await _send(websocket, {
                        "type": "error",
                        "message": f"Evaluation failed: {error_message}",
                    })
                    continue
                await _broadcast_state_events(websocket, prev_state, new_state)
                prev_state = new_state

                if interrupt_val:
                    await _send(websocket, {"type": "question", "data": interrupt_val})
                elif new_state.get("session_summary"):
                    await _send(websocket, {"type": "done"})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await _send(websocket, {"type": "error", "message": str(e)})
        except Exception:
            pass


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

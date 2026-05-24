# Interview Prep AI

**Live app:** [https://interview-ai-jade-six.vercel.app/](https://interview-ai-jade-six.vercel.app/)

Company-targeted mock coding interviews powered by a multi-agent LangGraph backend and a React UI. The system researches how a company interviews for your role, runs a realistic session (e.g. one LeetCode-style problem plus follow-ups for Google), scores your work, and ends with a session review.

## What you get

- **Company-shaped sessions** — Research (Tavily) infers interview format; templates include *one problem + follow-ups* (Google-style) or *multiple independent problems*.
- **Live WebSocket UI** — Chat status, question tabs, Monaco-style coding area, and session review.
- **In-session coach** — Side drawer for hints (syntax, think-aloud, sanity check, complexity); uses the same Gemini key as interview generation.
- **Follow-up dialogue** — On verbal follow-up turns, chat with an AI interviewer before you submit; transcript is included in evaluation.
- **Streaming feedback** — Evaluation and critique stream over the socket so long runs don’t look hung.
- **Persistent research cache** — Company research can be reused (SQLite; use a Railway volume in production).

## Architecture

```
Browser (Vercel)  ──wss://──►  FastAPI + LangGraph (Railway)
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
              Research          Orchestrator    Session review
                    │               │
                    ▼               ├──► Interview (generate → interrupt)
              Tavily search         ├──► Evaluation → Critic
                                    └──► SQLite checkpoints + history

During interrupt (open question):
  Coach sidebar  ──► coach_agent (WebSocket `coach`)
  Follow-up chat ──► interviewer_agent (WebSocket `turn_chat`)
```

**Agents:** orchestrator, research, interview, evaluation, critic, session review, plus **coach** and **interviewer** outside the graph during human-in-the-loop interrupts.

## Quick start (local)

### 1. Backend

```bash
git clone https://github.com/<your-org>/InterviewAI.git
cd InterviewAI
pip install -r requirements.txt
cp .env.example .env
# Edit .env: GEMINI_API_KEY, TAVILY_API_KEY
python main.py
```

API defaults to `http://127.0.0.1:8001` (see `API_PORT` in `.env`).

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://127.0.0.1:5173** — Vite proxies `/ws` to the API. No `VITE_WS_URL` needed locally.

### 3. Optional: single-port UI

```bash
cd frontend && npm run build
python main.py
```

Open **http://127.0.0.1:8001/** for the built app and API together.

## Production deploy

Frontend on **Vercel**, backend on **Railway** (WebSockets must use `wss://` to Railway, not Vercel).

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for env vars, `VITE_WS_URL`, CORS, volumes, and troubleshooting.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes* | Single key for all agents (simplest) |
| `TAVILY_API_KEY` | Yes | Web research |
| `CORS_ORIGINS` | Prod | Comma-separated Vercel origin(s) on Railway |
| `DATA_DIR` | Prod | e.g. `/data` with a Railway volume |

\*Or set per-agent `GEMINI_API_KEY_ORCHESTRATOR`, `GEMINI_API_KEY_RESEARCH`, etc.

**Question generation** (main problem + follow-up prompts) uses `GEMINI_API_KEY_INTERVIEW` or `GEMINI_API_KEY`. **Live follow-up chat** (`turn_chat` probes) uses `GEMINI_API_KEY_INTERVIEWER`. **Coach hints** use `GEMINI_API_KEY_CHAT`.

Optional tuning: `PASS_SCORE_THRESHOLD`, `SKIP_CRITIQUE_LLM`, `CALIBRATION_QUESTION_COUNT`, `MODEL_*`, `RPM_*` — see [`.env.example`](.env.example).

## How a session runs

1. You enter name, company, and role (and coding language).
2. **Research** runs (cached when fresh); orchestrator picks topics and interview template.
3. **Primary coding problem** — write code, use coach hints, submit.
4. **Follow-ups** (when template includes them) — dialogue with the interviewer, then submit response.
5. **Evaluation → critic** — scores and feedback stream back; orchestrator may send the next turn or end the session.
6. **Session review** — overall tier, summary, and study recommendations.

## Project structure

```
InterviewAI/
├── api.py                 # FastAPI + WebSocket protocol
├── main.py                # Local API launcher
├── Dockerfile             # Railway image
├── railway.toml
├── DEPLOYMENT.md
├── frontend/              # React + Vite (Vercel)
│   └── src/
│       ├── hooks/useInterview.ts
│       └── components/    # CoachDrawer, FollowUpDialoguePanel, CodeSandbox, …
└── src/
    ├── graph.py           # LangGraph workflow
    ├── interview_template.py
    ├── config.py
    ├── llm_router.py      # Per-agent Gemini models + rate limits
    └── agents/
        ├── research_agent.py
        ├── orchestrator.py
        ├── interview_agent.py
        ├── evaluation_agent.py
        ├── critic_agent.py
        ├── session_review_agent.py
        ├── coach_agent.py
        └── interviewer_agent.py
```

## Tech stack

- **Backend:** Python 3.12, FastAPI, LangGraph, LangChain, Google Gemini, Tavily, SQLite
- **Frontend:** React, TypeScript, Vite, Tailwind CSS

## License

Add your license here if applicable.

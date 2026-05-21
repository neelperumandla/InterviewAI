# Deployment: Railway (backend) + Vercel (frontend)

The app uses **WebSockets** for live interviews. The frontend on Vercel must talk to the API on Railway over **`wss://`** (not Vercel rewrites).

## Architecture

```
Browser  ──HTTPS──►  Vercel (static React)
    │
    └──wss://──────►  Railway (FastAPI + LangGraph + SQLite volume)
```

---

## 1. Railway — backend

### Create the service

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub** → select this repo.
2. Railway builds with the root **`Dockerfile`** (see `railway.toml`).
3. Add a **Volume** mounted at `/data` (Settings → Volumes) so sessions and research cache survive redeploys.

### Environment variables

Set in Railway → **Variables**:

| Variable | Required | Example |
|----------|----------|---------|
| `GEMINI_API_KEY` | Yes* | `AIza...` |
| `TAVILY_API_KEY` | Yes | `tvly-...` |
| `DATA_DIR` | Recommended | `/data` |
| `CORS_ORIGINS` | Yes for Vercel | `https://your-app.vercel.app` |

\*Or set all `GEMINI_API_KEY_*` keys instead of `GEMINI_API_KEY`.

Optional: copy other keys from [`.env.example`](.env.example).

`PORT` is set by Railway automatically — do not override unless you know why.

### Public URL

After deploy, open **Settings → Networking → Generate Domain**.  
Your WebSocket URL will be:

```text
wss://<your-railway-domain>/ws/<session_id>
```

Health check: `https://<your-railway-domain>/health`

### Notes

- Long requests (research, evaluation) can take 30–90s; Railway’s default timeout is usually fine for WebSockets.
- SQLite files live under `/data` when `DATA_DIR=/data` and a volume is attached.

---

## 2. Vercel — frontend

### Create the project

1. [vercel.com](https://vercel.com) → **Add New** → **Project** → import the same GitHub repo.
2. **Root Directory:** `frontend`
3. **Framework Preset:** Vite
4. **Build Command:** `npm run build`
5. **Output Directory:** `dist`

(`frontend/vercel.json` adds SPA fallback routes.)

### Environment variables

In Vercel → **Settings → Environment Variables** (Production + Preview):

| Variable | Value |
|----------|--------|
| `VITE_WS_URL` | `wss://<your-railway-domain>/ws` |

No trailing slash on the path before `/ws` — the app appends `/ws/{sessionId}`.

Redeploy after changing env vars (Vite inlines them at build time).

### CORS on Railway

Set `CORS_ORIGINS` on Railway to your Vercel URL(s), e.g.:

```text
https://interview-ai.vercel.app,https://interview-ai-git-main-you.vercel.app
```

Use your real Vercel production (and preview) origins. Avoid `*` in production when using credentials.

---

## 3. Verify

1. Open the Vercel URL → start a session (name, company, role).
2. Browser devtools → **Network → WS** — connection should go to `wss://….railway.app/ws/…`, not `vercel.app`.
3. Complete one question; confirm feedback and the next turn load.

---

## 4. Local parity

| | Backend | Frontend |
|---|---------|----------|
| Dev | `python main.py` (port 8001) | `cd frontend && npm run dev` |
| Env | `.env` from `.env.example` | optional `frontend/.env.development` |

---

## 5. Troubleshooting

| Symptom | Fix |
|---------|-----|
| WS connects then fails | Check `VITE_WS_URL` uses `wss://` and Railway domain is public |
| CORS error in browser | Add exact Vercel origin to `CORS_ORIGINS` on Railway |
| Sessions reset every deploy | Attach Railway volume + `DATA_DIR=/data` |
| `invalid_grant` / Gemini errors | Set valid `GEMINI_API_KEY` on Railway (not gcloud ADC) |
| Build fails on Vercel | Root directory must be `frontend`, Node 18+ |
| Deploy fails **network health check** | Ensure `GEMINI_API_KEY` + `TAVILY_API_KEY` on Railway; open deploy logs for startup errors; confirm service listens on Railway’s `PORT` (default). `/health` must return 200 — check `https://<railway-domain>/health` after deploy. |

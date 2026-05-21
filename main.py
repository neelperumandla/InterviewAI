"""Launch the Interview Prep AI API server.

Usage:
  python main.py          # start the FastAPI + WebSocket server
  python main.py --reload # hot-reload for development

UI (pick one):
  • Same port as API: cd frontend && npm run build  →  open http://127.0.0.1:<API_PORT>/
  • Dev / HMR:        cd frontend && npm run dev   →  http://127.0.0.1:5173 (API must be up on API_PORT)
"""
import sys
import uvicorn
from src.config import config


def main() -> None:
    config.validate()
    reload = "--reload" in sys.argv
    uvicorn.run(
        "api:app",
        host=config.API_HOST,
        port=config.API_PORT,
        reload=reload,
        log_level="info",
        # Keep WebSockets alive through long LLM chains (evaluation → critique → orchestrator).
        ws_ping_interval=20.0,
        ws_ping_timeout=120.0,
    )


if __name__ == "__main__":
    main()

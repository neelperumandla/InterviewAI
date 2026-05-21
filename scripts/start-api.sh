#!/bin/sh
set -e

PORT="${PORT:-8000}"

# Start immediately so Railway's /health probe can succeed; validate in lifespan.
exec uvicorn api:app \
  --host 0.0.0.0 \
  --port "$PORT" \
  --ws-ping-interval 20 \
  --ws-ping-timeout 120

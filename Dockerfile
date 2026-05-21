FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DATA_DIR=/data

RUN mkdir -p /data

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY api.py main.py ./
COPY src ./src
COPY scripts/start-api.sh ./scripts/start-api.sh
RUN chmod +x ./scripts/start-api.sh

EXPOSE 8000

# Inline start avoids CRLF issues in start-api.sh on Windows checkouts
CMD ["sh", "-c", "exec uvicorn api:app --host 0.0.0.0 --port ${PORT:-8000} --ws-ping-interval 20 --ws-ping-timeout 120"]

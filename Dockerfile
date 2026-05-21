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

CMD ["sh", "scripts/start-api.sh"]

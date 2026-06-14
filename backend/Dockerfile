# ─── Backend: Sniffer Scapy + Flask API ───────────────────────────────────────
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        libpcap-dev \
        tcpdump \
        iproute2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/logs
ENV NIDS_LOG_DIR=/app/logs

RUN mkdir -p /app/data
ENV NIDS_DB_PATH=/app/data/nids.db

EXPOSE 5000

ENV PYTHONUNBUFFERED=1

CMD ["python", "live_sniffer_with_api.py"]

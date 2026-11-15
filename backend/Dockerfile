FROM python:3.11-slim

WORKDIR /app

# build tools p/ extensões nativas (ex.: jq, cryptography)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential autoconf automake libtool \
 && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

EXPOSE 8000
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]

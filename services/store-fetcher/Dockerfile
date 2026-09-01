FROM python:3.11-slim

WORKDIR /app

# Security: Create non-root user
RUN useradd -m -u 1001 appuser

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 3003

HEALTHCHECK --interval=15s --timeout=5s --retries=3 --start-period=10s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:3003/health')"

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "3003"]

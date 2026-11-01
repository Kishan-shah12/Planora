FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=10000

WORKDIR /srv

# Create non-root system user for security
RUN useradd --system --uid 1001 appuser

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY app app
COPY wsgi.py run.py pyproject.toml ./

USER appuser

EXPOSE 10000

# Single process with multiple threads so in-memory sliding rate limiter and cache are shared
CMD exec gunicorn --bind "0.0.0.0:${PORT}" --workers 1 --threads 8 --timeout 60 wsgi:app

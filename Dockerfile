FROM python:3.11.9-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY pyproject.toml README.md ./
COPY src ./src
COPY fetch_results.py ./
RUN pip install --no-cache-dir -e . \
    && useradd --uid 1000 --no-create-home app
USER app

EXPOSE 8000
CMD ["python", "-m", "uvicorn", "ripe_atlas_tcc.api:app", "--host", "0.0.0.0", "--port", "8000"]

import os
from pathlib import Path

from dotenv import load_dotenv

PING_MEASUREMENTS = (
    {
        "measurement_id": 1001,
        "target_name": "K-root",
        "measurement_category": "built-in",
    },
    {
        "measurement_id": 86206926,
        "target_name": "Google",
        "measurement_category": "well-known",
    },
)
INITIAL_LOOKBACK_MINUTES = 15
MIN_COLLECTION_INTERVAL_MINUTES = 5
COLLECTION_DELAY_MINUTES = 5
COLLECTION_STATE_PATH = Path("data/state/collection_state.json")
PROBE_STATE_PATH = Path("data/state/probe.json")
BACKFILL_STATE_DIRECTORY = Path("data/state/backfill")
LEGACY_BACKFILL_STATE_PATH = Path("data/state/backfill_state.json")
EXECUTION_LOCK_PATH = Path("data/state/pipeline.lock")
BACKFILL_BLOCK_DAYS = 1
RIPE_API_MAX_ATTEMPTS = 3
RIPE_API_RETRY_BASE_DELAY_SECONDS = 1
DEFAULT_POLLING_INTERVAL_SECONDS = 60


def load_polling_interval_seconds():
    load_dotenv()
    configured_value = os.getenv(
        "POLLING_INTERVAL_SECONDS",
        str(DEFAULT_POLLING_INTERVAL_SECONDS),
    )

    try:
        polling_interval_seconds = int(configured_value)
    except ValueError as error:
        raise RuntimeError(
            "POLLING_INTERVAL_SECONDS must be a positive integer"
        ) from error

    if polling_interval_seconds <= 0:
        raise RuntimeError(
            "POLLING_INTERVAL_SECONDS must be a positive integer"
        )

    return polling_interval_seconds


def load_influxdb_config():
    load_dotenv()

    token = os.getenv("INFLUXDB_TOKEN")
    token_file = os.getenv("INFLUXDB_TOKEN_FILE")
    if not token and token_file:
        try:
            token = Path(token_file).read_text(encoding="utf-8").strip()
        except OSError as error:
            raise RuntimeError(
                f"Cannot read INFLUXDB_TOKEN_FILE: {token_file}"
            ) from error

    variable_names = (
        "INFLUXDB_URL",
        "INFLUXDB_ORG",
        "INFLUXDB_BUCKET",
    )
    missing_variables = [
        name for name in variable_names if not os.getenv(name)
    ]
    if not token:
        missing_variables.append("INFLUXDB_TOKEN")

    if missing_variables:
        missing_labels = ", ".join(missing_variables)
        raise RuntimeError(
            f"Missing required environment variables: {missing_labels}"
        )

    return {
        "url": os.environ["INFLUXDB_URL"],
        "org": os.environ["INFLUXDB_ORG"],
        "bucket": os.environ["INFLUXDB_BUCKET"],
        "token": token,
    }

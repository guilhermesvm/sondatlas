import os
from pathlib import Path

from dotenv import load_dotenv

PROBE_ID = 1017210
MEASUREMENT_ID = 1001
INITIAL_LOOKBACK_MINUTES = 15
MIN_COLLECTION_INTERVAL_MINUTES = 5
COLLECTION_DELAY_MINUTES = 5
COLLECTION_STATE_PATH = Path("data/state/collection_state.json")
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

    variable_names = (
        "INFLUXDB_URL",
        "INFLUXDB_ORG",
        "INFLUXDB_BUCKET",
        "INFLUXDB_TOKEN",
    )
    missing_variables = [
        name for name in variable_names if not os.getenv(name)
    ]

    if missing_variables:
        missing_labels = ", ".join(missing_variables)
        raise RuntimeError(
            f"Missing required environment variables: {missing_labels}"
        )

    return {
        "url": os.environ["INFLUXDB_URL"],
        "org": os.environ["INFLUXDB_ORG"],
        "bucket": os.environ["INFLUXDB_BUCKET"],
        "token": os.environ["INFLUXDB_TOKEN"],
    }

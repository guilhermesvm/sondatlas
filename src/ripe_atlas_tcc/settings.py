import os

from dotenv import load_dotenv

PROBE_ID = 1017210
MEASUREMENT_ID = 1001
COLLECTION_WINDOW_MINUTES = 15


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

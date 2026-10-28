from datetime import datetime, timezone
import time

import requests

RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


def fetch_probe(probe_id):
    response = requests.get(
        f"https://atlas.ripe.net/api/v2/probes/{probe_id}/",
        timeout=30,
    )
    if response.status_code == 404:
        raise RuntimeError(f"Probe {probe_id} does not exist in RIPE Atlas")
    response.raise_for_status()
    return response.json()


def fetch_probe_first_connected(probe_id):
    response = requests.get(
        f"https://atlas.ripe.net/api/v2/probes/{probe_id}/",
        timeout=30,
    )
    response.raise_for_status()
    first_connected = response.json()["first_connected"]
    if first_connected is None:
        return None
    return datetime.fromtimestamp(first_connected, tz=timezone.utc)


def retry_delay_seconds(response, attempt, base_delay_seconds):
    retry_after = response.headers.get("Retry-After")
    if retry_after is not None and retry_after.isdigit():
        return int(retry_after)

    return base_delay_seconds * (2 ** (attempt - 1))


def fetch_results(
    measurement_id,
    probe_id,
    start_time,
    stop_time,
    max_attempts=3,
    retry_base_delay_seconds=1,
):
    api_url = (
        f"https://atlas.ripe.net/api/v2/"
        f"measurements/{measurement_id}/results/"
    )

    params = {
        "probe_ids": probe_id,
        "start": int(start_time.timestamp()),
        "stop": int(stop_time.timestamp()),
    }

    for attempt in range(1, max_attempts + 1):
        try:
            response = requests.get(
                api_url,
                params=params,
                timeout=30,
            )
        except (requests.ConnectionError, requests.Timeout):
            if attempt == max_attempts:
                raise

            delay_seconds = retry_base_delay_seconds * (
                2 ** (attempt - 1)
            )
            time.sleep(delay_seconds)
            continue

        if (
            response.status_code in RETRYABLE_STATUS_CODES
            and attempt < max_attempts
        ):
            delay_seconds = retry_delay_seconds(
                response=response,
                attempt=attempt,
                base_delay_seconds=retry_base_delay_seconds,
            )
            time.sleep(delay_seconds)
            continue

        response.raise_for_status()
        return response.json(), response.url

    raise RuntimeError("RIPE Atlas request ended without a response")

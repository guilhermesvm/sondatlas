import requests


def fetch_results(measurement_id, probe_id, start_time, stop_time):
    api_url = (
        f"https://atlas.ripe.net/api/v2/"
        f"measurements/{measurement_id}/results/"
    )

    params = {
        "probe_ids": probe_id,
        "start": int(start_time.timestamp()),
        "stop": int(stop_time.timestamp()),
    }

    response = requests.get(
        api_url,
        params=params,
        timeout=30,
    )
    response.raise_for_status()

    return response.json(), response.url

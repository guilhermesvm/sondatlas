from datetime import datetime, timedelta, timezone
from pathlib import Path

from ripe_atlas_tcc.console_output import (
    print_ping_results,
    print_run_summary,
)
from ripe_atlas_tcc.influxdb_storage import write_ping_results
from ripe_atlas_tcc.json_storage import (
    save_normalized_results,
    save_raw_results,
)
from ripe_atlas_tcc.normalization import normalize_ping_result
from ripe_atlas_tcc.ripe_atlas_client import fetch_results
from ripe_atlas_tcc.settings import (
    COLLECTION_WINDOW_MINUTES,
    MEASUREMENT_ID,
    PROBE_ID,
    load_influxdb_config,
)


def main():
    stop_time = datetime.now(timezone.utc)
    start_time = stop_time - timedelta(minutes=COLLECTION_WINDOW_MINUTES)

    results, request_url = fetch_results(
        measurement_id=MEASUREMENT_ID,
        probe_id=PROBE_ID,
        start_time=start_time,
        stop_time=stop_time,
    )

    raw_output_path = save_raw_results(
        results=results,
        measurement_id=MEASUREMENT_ID,
        probe_id=PROBE_ID,
        start_time=start_time,
        stop_time=stop_time,
        output_directory=Path("data/raw"),
    )

    normalized_results = [
        normalize_ping_result(result) for result in results
    ]

    normalized_output_path = save_normalized_results(
        results=normalized_results,
        measurement_id=MEASUREMENT_ID,
        probe_id=PROBE_ID,
        start_time=start_time,
        stop_time=stop_time,
        output_directory=Path("data/normalized"),
    )

    influxdb_config = load_influxdb_config()
    written_points = write_ping_results(
        results=normalized_results,
        **influxdb_config,
    )

    print_run_summary(
        request_url=request_url,
        results_count=len(results),
        raw_output_path=raw_output_path,
        normalized_output_path=normalized_output_path,
        written_points=written_points,
    )
    print_ping_results(normalized_results)

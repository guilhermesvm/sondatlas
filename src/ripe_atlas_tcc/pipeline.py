from datetime import datetime, timedelta, timezone
from pathlib import Path

from ripe_atlas_tcc.collection_state import (
    calculate_collection_window,
    load_last_successful_stop,
    save_last_successful_stop,
)
from ripe_atlas_tcc.console_output import (
    print_no_collection_interval,
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
    COLLECTION_DELAY_MINUTES,
    COLLECTION_STATE_PATH,
    INITIAL_LOOKBACK_MINUTES,
    MEASUREMENT_ID,
    MIN_COLLECTION_INTERVAL_MINUTES,
    PROBE_ID,
    RIPE_API_MAX_ATTEMPTS,
    RIPE_API_RETRY_BASE_DELAY_SECONDS,
    load_influxdb_config,
)


def main():
    current_time = datetime.now(timezone.utc)
    last_successful_stop = load_last_successful_stop(
        state_path=COLLECTION_STATE_PATH,
        measurement_id=MEASUREMENT_ID,
        probe_id=PROBE_ID,
    )
    collection_window = calculate_collection_window(
        current_time=current_time,
        last_successful_stop=last_successful_stop,
        initial_lookback_minutes=INITIAL_LOOKBACK_MINUTES,
        minimum_interval_minutes=MIN_COLLECTION_INTERVAL_MINUTES,
        collection_delay_minutes=COLLECTION_DELAY_MINUTES,
    )

    if collection_window is None:
        available_at = last_successful_stop + timedelta(
            minutes=(
                MIN_COLLECTION_INTERVAL_MINUTES
                + COLLECTION_DELAY_MINUTES
            )
        )
        print_no_collection_interval(available_at)
        return

    start_time, stop_time = collection_window

    results, request_url = fetch_results(
        measurement_id=MEASUREMENT_ID,
        probe_id=PROBE_ID,
        start_time=start_time,
        stop_time=stop_time,
        max_attempts=RIPE_API_MAX_ATTEMPTS,
        retry_base_delay_seconds=RIPE_API_RETRY_BASE_DELAY_SECONDS,
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

    save_last_successful_stop(
        state_path=COLLECTION_STATE_PATH,
        measurement_id=MEASUREMENT_ID,
        probe_id=PROBE_ID,
        stop_time=stop_time,
    )

    print_run_summary(
        request_url=request_url,
        results_count=len(results),
        raw_output_path=raw_output_path,
        normalized_output_path=normalized_output_path,
        written_points=written_points,
    )
    print_ping_results(normalized_results)

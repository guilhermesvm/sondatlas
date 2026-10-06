import argparse
import time
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
    print_polling_started,
    print_polling_stopped,
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
    MIN_COLLECTION_INTERVAL_MINUTES,
    PING_MEASUREMENTS,
    PROBE_ID,
    RIPE_API_MAX_ATTEMPTS,
    RIPE_API_RETRY_BASE_DELAY_SECONDS,
    load_influxdb_config,
    load_polling_interval_seconds,
)


def run_measurement_cycle(
    measurement,
    current_time,
    show_wait_message=True,
):
    measurement_id = measurement["measurement_id"]
    target_name = measurement["target_name"]
    last_successful_stop = load_last_successful_stop(
        state_path=COLLECTION_STATE_PATH,
        measurement_id=measurement_id,
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
        if show_wait_message:
            print_no_collection_interval(
                available_at=available_at,
                measurement_id=measurement_id,
                target_name=target_name,
            )
        return available_at

    start_time, stop_time = collection_window

    results, request_url = fetch_results(
        measurement_id=measurement_id,
        probe_id=PROBE_ID,
        start_time=start_time,
        stop_time=stop_time,
        max_attempts=RIPE_API_MAX_ATTEMPTS,
        retry_base_delay_seconds=RIPE_API_RETRY_BASE_DELAY_SECONDS,
    )

    raw_output_path = save_raw_results(
        results=results,
        measurement_id=measurement_id,
        probe_id=PROBE_ID,
        start_time=start_time,
        stop_time=stop_time,
        output_directory=Path("data/raw"),
    )

    normalized_results = [
        normalize_ping_result(
            result,
            target_name=target_name,
            measurement_category=measurement["measurement_category"],
        )
        for result in results
    ]

    normalized_output_path = save_normalized_results(
        results=normalized_results,
        measurement_id=measurement_id,
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
        measurement_id=measurement_id,
        probe_id=PROBE_ID,
        stop_time=stop_time,
    )

    print_run_summary(
        target_name=target_name,
        measurement_category=measurement["measurement_category"],
        request_url=request_url,
        results_count=len(results),
        raw_output_path=raw_output_path,
        normalized_output_path=normalized_output_path,
        written_points=written_points,
    )
    print_ping_results(normalized_results)


def run_collection_cycle(show_wait_message=True):
    current_time = datetime.now(timezone.utc)
    waiting_windows = {}

    for measurement in PING_MEASUREMENTS:
        available_at = run_measurement_cycle(
            measurement=measurement,
            current_time=current_time,
            show_wait_message=show_wait_message,
        )
        if available_at is not None:
            waiting_windows[measurement["measurement_id"]] = available_at

    return waiting_windows


def run_polling():
    polling_interval_seconds = load_polling_interval_seconds()
    announced_windows = {}

    try:
        print_polling_started(polling_interval_seconds)

        while True:
            waiting_windows = run_collection_cycle(show_wait_message=False)

            for measurement in PING_MEASUREMENTS:
                measurement_id = measurement["measurement_id"]
                available_at = waiting_windows.get(measurement_id)
                if (
                    available_at is not None
                    and announced_windows.get(measurement_id) != available_at
                ):
                    print_no_collection_interval(
                        available_at=available_at,
                        measurement_id=measurement_id,
                        target_name=measurement["target_name"],
                    )

            announced_windows = waiting_windows

            time.sleep(polling_interval_seconds)
    except KeyboardInterrupt:
        print_polling_stopped()


def main(arguments=None):
    parser = argparse.ArgumentParser(
        description="Collect RIPE Atlas measurement results."
    )
    parser.add_argument(
        "--poll",
        action="store_true",
        help="keep collecting continuously",
    )
    options = parser.parse_args(arguments)

    if options.poll:
        run_polling()
    else:
        run_collection_cycle()

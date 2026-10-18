import argparse
import math
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from ripe_atlas_tcc.backfill_state import (
    create_backfill_state,
    load_backfill_state,
    mark_backfill_complete,
    save_backfill_progress,
)
from ripe_atlas_tcc.collection_state import (
    calculate_collection_window,
    load_last_successful_stop,
    save_last_successful_stop,
    save_last_successful_stops,
)
from ripe_atlas_tcc.console_output import (
    print_backfill_completed,
    print_backfill_block,
    print_backfill_started,
    print_no_collection_interval,
    print_ping_results,
    print_polling_probe,
    print_polling_started,
    print_polling_stopped,
    print_probe_selected,
    print_run_summary,
    print_waiting_for_probe,
)
from ripe_atlas_tcc.influxdb_storage import write_ping_results
from ripe_atlas_tcc.execution_lock import execution_lock
from ripe_atlas_tcc.json_storage import (
    save_normalized_results,
    save_raw_results,
)
from ripe_atlas_tcc.normalization import normalize_ping_result
from ripe_atlas_tcc.probe_state import load_selected_probe, save_selected_probe
from ripe_atlas_tcc.ripe_atlas_client import (
    fetch_probe,
    fetch_probe_first_connected,
    fetch_results,
)
from ripe_atlas_tcc.settings import (
    BACKFILL_BLOCK_DAYS,
    BACKFILL_STATE_PATH,
    COLLECTION_DELAY_MINUTES,
    COLLECTION_STATE_PATH,
    EXECUTION_LOCK_PATH,
    INITIAL_LOOKBACK_MINUTES,
    MIN_COLLECTION_INTERVAL_MINUTES,
    PING_MEASUREMENTS,
    PROBE_STATE_PATH,
    RIPE_API_MAX_ATTEMPTS,
    RIPE_API_RETRY_BASE_DELAY_SECONDS,
    load_influxdb_config,
    load_polling_interval_seconds,
)


def select_probe(probe_id):
    """Validate the probe in RIPE Atlas and save it for later runs."""
    probe = fetch_probe(probe_id)
    save_selected_probe(PROBE_STATE_PATH, probe_id)
    return probe


def persist_measurement_window(
    measurement,
    probe_id,
    start_time,
    stop_time,
    influxdb_config=None,
    show_summary=True,
    show_ping_results=True,
):
    measurement_id = measurement["measurement_id"]
    target_name = measurement["target_name"]

    results, request_url = fetch_results(
        measurement_id=measurement_id,
        probe_id=probe_id,
        start_time=start_time,
        stop_time=stop_time,
        max_attempts=RIPE_API_MAX_ATTEMPTS,
        retry_base_delay_seconds=RIPE_API_RETRY_BASE_DELAY_SECONDS,
    )

    raw_output_path = save_raw_results(
        results=results,
        measurement_id=measurement_id,
        probe_id=probe_id,
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
        probe_id=probe_id,
        start_time=start_time,
        stop_time=stop_time,
        output_directory=Path("data/normalized"),
    )

    if influxdb_config is None:
        influxdb_config = load_influxdb_config()

    written_points = write_ping_results(
        results=normalized_results,
        **influxdb_config,
    )

    if show_summary:
        print_run_summary(
            target_name=target_name,
            measurement_category=measurement["measurement_category"],
            request_url=request_url,
            results_count=len(results),
            raw_output_path=raw_output_path,
            normalized_output_path=normalized_output_path,
            written_points=written_points,
        )
    if show_ping_results:
        print_ping_results(normalized_results)

    return len(results), written_points


def run_measurement_cycle(
    measurement,
    probe_id,
    current_time,
    show_wait_message=True,
):
    measurement_id = measurement["measurement_id"]
    target_name = measurement["target_name"]
    last_successful_stop = load_last_successful_stop(
        state_path=COLLECTION_STATE_PATH,
        measurement_id=measurement_id,
        probe_id=probe_id,
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

    persist_measurement_window(
        measurement=measurement,
        probe_id=probe_id,
        start_time=start_time,
        stop_time=stop_time,
    )

    save_last_successful_stop(
        state_path=COLLECTION_STATE_PATH,
        measurement_id=measurement_id,
        probe_id=probe_id,
        stop_time=stop_time,
    )

def run_collection_cycle(probe_id, show_wait_message=True):
    current_time = datetime.now(timezone.utc)
    waiting_windows = {}

    for measurement in PING_MEASUREMENTS:
        available_at = run_measurement_cycle(
            measurement=measurement,
            probe_id=probe_id,
            current_time=current_time,
            show_wait_message=show_wait_message,
        )
        if available_at is not None:
            waiting_windows[measurement["measurement_id"]] = available_at

    return waiting_windows


def run_polling():
    polling_interval_seconds = load_polling_interval_seconds()
    announced_windows = {}
    announced_probe_id = object()

    try:
        print_polling_started(polling_interval_seconds)

        while True:
            probe_id = load_selected_probe(PROBE_STATE_PATH)
            if probe_id != announced_probe_id:
                if probe_id is None:
                    print_waiting_for_probe()
                else:
                    print_polling_probe(probe_id)
                announced_probe_id = probe_id
                announced_windows = {}

            if probe_id is None:
                time.sleep(polling_interval_seconds)
                continue

            waiting_windows = run_collection_cycle(
                probe_id, show_wait_message=False
            )

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


def run_all_time_backfill(probe_id, current_time=None):
    influxdb_config = load_influxdb_config()
    state = load_backfill_state(BACKFILL_STATE_PATH)

    if state is None:
        start_time = fetch_probe_first_connected(probe_id)
        if current_time is None:
            current_time = datetime.now(timezone.utc)
        stop_time = (
            current_time.astimezone(timezone.utc).replace(microsecond=0)
            - timedelta(minutes=COLLECTION_DELAY_MINUTES)
        )
        if start_time >= stop_time:
            raise RuntimeError("Probe history is not available for backfill")

        state = create_backfill_state(
            state_path=BACKFILL_STATE_PATH,
            probe_id=probe_id,
            bucket=influxdb_config["bucket"],
            start_time=start_time,
            stop_time=stop_time,
            measurement_ids=(
                measurement["measurement_id"]
                for measurement in PING_MEASUREMENTS
            ),
        )
    else:
        if state["probe_id"] != probe_id:
            raise RuntimeError("Backfill state belongs to another probe")
        if state["bucket"] != influxdb_config["bucket"]:
            raise RuntimeError("Backfill state belongs to another bucket")

        expected_measurements = {
            str(measurement["measurement_id"])
            for measurement in PING_MEASUREMENTS
        }
        if set(state["measurements"]) != expected_measurements:
            raise RuntimeError(
                "Backfill state does not match the ping catalog"
            )

    start_time = datetime.fromisoformat(state["start_time"])
    stop_time = datetime.fromisoformat(state["stop_time"])
    print_backfill_started(start_time, stop_time)
    block_duration = timedelta(days=BACKFILL_BLOCK_DAYS)
    total_blocks = math.ceil((stop_time - start_time) / block_duration)

    for measurement in PING_MEASUREMENTS:
        measurement_id = measurement["measurement_id"]
        next_start = datetime.fromisoformat(
            state["measurements"][str(measurement_id)]["next_start"]
        )

        while next_start < stop_time:
            block_stop = min(next_start + block_duration, stop_time)
            block_number = (
                (next_start - start_time) // block_duration
            ) + 1
            results_count, written_points = persist_measurement_window(
                measurement=measurement,
                probe_id=probe_id,
                start_time=next_start,
                stop_time=block_stop,
                influxdb_config=influxdb_config,
                show_summary=False,
                show_ping_results=False,
            )
            print_backfill_block(
                target_name=measurement["target_name"],
                block_number=block_number,
                total_blocks=total_blocks,
                start_time=next_start,
                stop_time=block_stop,
                results_count=results_count,
                written_points=written_points,
            )
            save_backfill_progress(
                state_path=BACKFILL_STATE_PATH,
                state=state,
                measurement_id=measurement_id,
                next_start=block_stop,
            )
            next_start = block_stop

    save_last_successful_stops(
        COLLECTION_STATE_PATH,
        [
            (measurement["measurement_id"], probe_id, stop_time)
            for measurement in PING_MEASUREMENTS
        ],
    )
    mark_backfill_complete(BACKFILL_STATE_PATH, state)
    print_backfill_completed(stop_time)


def positive_int(value):
    number = int(value)
    if number <= 0:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return number


def main(arguments=None):
    parser = argparse.ArgumentParser(
        description="Collect RIPE Atlas measurement results."
    )
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument(
        "--poll",
        action="store_true",
        help="keep collecting continuously",
    )
    modes.add_argument(
        "--all-time",
        action="store_true",
        help="initialize the database with all available ping history",
    )
    parser.add_argument(
        "--probe-id",
        type=positive_int,
        help=(
            "select your RIPE Atlas probe and save it for later runs; "
            "alone it only selects, with --poll or --all-time it also collects"
        ),
    )
    options = parser.parse_args(arguments)

    try:
        if options.probe_id is None:
            probe_id = load_selected_probe(PROBE_STATE_PATH)
        else:
            probe = select_probe(options.probe_id)
            probe_id = options.probe_id
            print_probe_selected(probe_id, probe["status"]["name"])
    except RuntimeError as error:
        parser.error(str(error))
    if options.probe_id is not None and not (options.poll or options.all_time):
        return
    if probe_id is None and not options.poll:
        parser.error("No probe selected: run with --probe-id <your probe ID>")

    with execution_lock(EXECUTION_LOCK_PATH):
        if options.poll:
            run_polling()
        elif options.all_time:
            run_all_time_backfill(probe_id)
        else:
            run_collection_cycle(probe_id)

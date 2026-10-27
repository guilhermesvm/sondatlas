import json
from datetime import datetime, timezone

from ripe_atlas_tcc.pipeline.collection_state import (
    calculate_collection_window,
    load_last_successful_stop,
    save_last_successful_stop,
    save_last_successful_stops,
)


def test_calculate_first_window_uses_configured_duration():
    current_time = datetime(2026, 10, 2, 12, 15, 30, tzinfo=timezone.utc)

    start_time, stop_time = calculate_collection_window(
        current_time=current_time,
        last_successful_stop=None,
        initial_lookback_minutes=15,
        minimum_interval_minutes=5,
        collection_delay_minutes=5,
    )

    assert start_time == datetime(
        2026, 10, 2, 11, 55, 30, tzinfo=timezone.utc
    )
    assert stop_time == datetime(
        2026, 10, 2, 12, 10, 30, tzinfo=timezone.utc
    )


def test_calculate_next_window_recovers_all_safe_backlog():
    last_stop = datetime(2026, 10, 2, 12, 15, tzinfo=timezone.utc)

    window = calculate_collection_window(
        current_time=datetime(2026, 10, 2, 13, 0, tzinfo=timezone.utc),
        last_successful_stop=last_stop,
        initial_lookback_minutes=15,
        minimum_interval_minutes=5,
        collection_delay_minutes=5,
    )

    assert window == (
        last_stop,
        datetime(2026, 10, 2, 12, 55, tzinfo=timezone.utc),
    )


def test_calculate_window_returns_none_until_window_is_complete():
    last_stop = datetime(2026, 10, 2, 12, 15, tzinfo=timezone.utc)

    window = calculate_collection_window(
        current_time=datetime(2026, 10, 2, 12, 20, tzinfo=timezone.utc),
        last_successful_stop=last_stop,
        initial_lookback_minutes=15,
        minimum_interval_minutes=5,
        collection_delay_minutes=5,
    )

    assert window is None


def test_save_and_load_checkpoint(tmp_path):
    state_path = tmp_path / "state" / "collection_state.json"
    stop_time = datetime(2026, 10, 2, 12, 15, tzinfo=timezone.utc)

    save_last_successful_stop(
        state_path=state_path,
        measurement_id=1001,
        probe_id=1017210,
        stop_time=stop_time,
    )

    assert load_last_successful_stop(
        state_path=state_path,
        measurement_id=1001,
        probe_id=1017210,
    ) == stop_time
    assert json.loads(state_path.read_text(encoding="utf-8")) == {
        "version": 1,
        "checkpoints": {
            "measurement-1001_probe-1017210": {
                "last_successful_stop": "2026-10-02T12:15:00+00:00"
            }
        },
    }


def test_checkpoint_is_separate_for_each_measurement(tmp_path):
    state_path = tmp_path / "collection_state.json"
    ping_stop = datetime(2026, 10, 2, 12, 15, tzinfo=timezone.utc)
    traceroute_stop = datetime(2026, 10, 2, 12, 30, tzinfo=timezone.utc)

    save_last_successful_stop(state_path, 1001, 1017210, ping_stop)
    save_last_successful_stop(state_path, 5001, 1017210, traceroute_stop)

    assert load_last_successful_stop(state_path, 1001, 1017210) == ping_stop
    assert load_last_successful_stop(state_path, 5001, 1017210) == traceroute_stop


def test_save_multiple_checkpoints_in_one_state_write(tmp_path):
    state_path = tmp_path / "collection_state.json"
    stop_time = datetime(2026, 10, 2, 12, 15, tzinfo=timezone.utc)

    save_last_successful_stops(
        state_path,
        [
            (1001, 1017210, stop_time),
            (86206926, 1017210, stop_time),
        ],
    )

    assert load_last_successful_stop(
        state_path, 1001, 1017210
    ) == stop_time
    assert load_last_successful_stop(
        state_path, 86206926, 1017210
    ) == stop_time

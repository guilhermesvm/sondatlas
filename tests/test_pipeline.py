from datetime import datetime, timedelta, timezone

import pytest

from ripe_atlas_tcc import pipeline, probe_state


PROBE_ID = 1017210


@pytest.fixture(autouse=True)
def isolate_execution_lock(monkeypatch, tmp_path):
    monkeypatch.setattr(pipeline, "EXECUTION_LOCK_PATH", tmp_path / "pipeline.lock")
    monkeypatch.setattr(pipeline, "PROBE_STATE_PATH", tmp_path / "probe.json")
    monkeypatch.setattr(pipeline, "load_selected_probe", lambda path: PROBE_ID)


def test_main_does_not_collect_until_next_window_is_complete(monkeypatch):
    last_stop = datetime(2026, 10, 2, 12, 15, tzinfo=timezone.utc)
    captured = {}

    monkeypatch.setattr(
        pipeline,
        "load_last_successful_stop",
        lambda **kwargs: last_stop,
    )
    monkeypatch.setattr(
        pipeline,
        "calculate_collection_window",
        lambda **kwargs: None,
    )
    monkeypatch.setattr(
        pipeline,
        "print_no_collection_interval",
        lambda **kwargs: captured.update(kwargs),
    )
    monkeypatch.setattr(
        pipeline,
        "fetch_results",
        lambda **kwargs: pytest.fail("The API should not be called"),
    )

    available_at = pipeline.run_measurement_cycle(
        measurement=pipeline.PING_MEASUREMENTS[0],
        probe_id=PROBE_ID,
        current_time=datetime(2026, 10, 2, 12, 20, tzinfo=timezone.utc),
    )

    assert captured == {
        "available_at": datetime(
            2026, 10, 2, 12, 25, tzinfo=timezone.utc
        ),
        "measurement_id": 1001,
        "target_name": "K-root",
    }
    assert available_at == captured["available_at"]


def test_measurement_cycle_uses_given_probe_for_request_and_checkpoint(
    monkeypatch,
    tmp_path,
):
    other_probe_id = 1018246
    window = (
        datetime(2026, 10, 2, 12, 0, tzinfo=timezone.utc),
        datetime(2026, 10, 2, 12, 15, tzinfo=timezone.utc),
    )
    state_path = tmp_path / "collection_state.json"
    requested_probes = []

    monkeypatch.setattr(pipeline, "COLLECTION_STATE_PATH", state_path)
    monkeypatch.setattr(
        pipeline, "calculate_collection_window", lambda **kwargs: window
    )
    monkeypatch.setattr(
        pipeline,
        "persist_measurement_window",
        lambda **kwargs: requested_probes.append(kwargs["probe_id"]),
    )

    pipeline.run_measurement_cycle(
        measurement=pipeline.PING_MEASUREMENTS[0],
        probe_id=other_probe_id,
        current_time=datetime(2026, 10, 2, 12, 20, tzinfo=timezone.utc),
    )

    assert requested_probes == [other_probe_id]
    assert pipeline.load_last_successful_stop(
        state_path, 1001, other_probe_id
    ) == window[1]
    assert pipeline.load_last_successful_stop(state_path, 1001, PROBE_ID) is None


def test_main_does_not_advance_checkpoint_when_influxdb_write_fails(
    monkeypatch,
    tmp_path,
):
    start_time = datetime(2026, 10, 2, 12, 0, tzinfo=timezone.utc)
    stop_time = datetime(2026, 10, 2, 12, 15, tzinfo=timezone.utc)
    checkpoint_was_saved = False

    monkeypatch.setattr(
        pipeline,
        "load_last_successful_stop",
        lambda **kwargs: None,
    )
    monkeypatch.setattr(
        pipeline,
        "calculate_collection_window",
        lambda **kwargs: (start_time, stop_time),
    )
    monkeypatch.setattr(
        pipeline,
        "fetch_results",
        lambda **kwargs: ([{"timestamp": 1}], "https://example.test"),
    )
    monkeypatch.setattr(
        pipeline,
        "save_raw_results",
        lambda **kwargs: tmp_path / "raw.json",
    )
    monkeypatch.setattr(
        pipeline,
        "normalize_ping_result",
        lambda result, **kwargs: result,
    )
    monkeypatch.setattr(
        pipeline,
        "save_normalized_results",
        lambda **kwargs: tmp_path / "normalized.json",
    )
    monkeypatch.setattr(
        pipeline,
        "load_influxdb_config",
        lambda: {
            "url": "http://localhost:8086",
            "token": "test-token",
            "org": "test-org",
            "bucket": "test-bucket",
        },
    )

    def fail_influxdb_write(**kwargs):
        raise RuntimeError("write failed")

    monkeypatch.setattr(
        pipeline,
        "write_ping_results",
        fail_influxdb_write,
    )

    def record_checkpoint_save(**kwargs):
        nonlocal checkpoint_was_saved
        checkpoint_was_saved = True

    monkeypatch.setattr(
        pipeline,
        "save_last_successful_stop",
        record_checkpoint_save,
    )

    with pytest.raises(RuntimeError, match="write failed"):
        pipeline.run_measurement_cycle(
            measurement=pipeline.PING_MEASUREMENTS[0],
            probe_id=PROBE_ID,
            current_time=datetime.now(timezone.utc),
        )

    assert checkpoint_was_saved is False


def test_main_runs_one_cycle_by_default(monkeypatch):
    events = []

    monkeypatch.setattr(
        pipeline,
        "run_collection_cycle",
        lambda probe_id: events.append(("cycle", probe_id)),
    )
    monkeypatch.setattr(
        pipeline,
        "run_polling",
        lambda probe_id: events.append(("polling", probe_id)),
    )

    pipeline.main([])

    assert events == [("cycle", PROBE_ID)]


def test_main_without_selected_probe_stops_before_collecting(monkeypatch, capsys):
    monkeypatch.setattr(pipeline, "load_selected_probe", lambda path: None)
    monkeypatch.setattr(
        pipeline,
        "run_collection_cycle",
        lambda probe_id: pytest.fail("Collection should not start"),
    )

    with pytest.raises(SystemExit):
        pipeline.main([])

    assert "No probe selected: run with --probe-id" in capsys.readouterr().err


def test_probe_id_option_saves_probe_and_collects_it(monkeypatch):
    events = []
    monkeypatch.setattr(
        pipeline,
        "fetch_probe",
        lambda probe_id: {"id": probe_id, "status": {"name": "Connected"}},
    )
    monkeypatch.setattr(
        pipeline,
        "run_collection_cycle",
        lambda probe_id: events.append(probe_id),
    )

    pipeline.main(["--probe-id", "1018246"])

    assert events == [1018246]
    assert probe_state.load_selected_probe(
        pipeline.PROBE_STATE_PATH
    ) == 1018246


def test_unknown_probe_is_not_saved(monkeypatch, capsys):
    def probe_not_found(probe_id):
        raise RuntimeError(f"Probe {probe_id} does not exist in RIPE Atlas")

    monkeypatch.setattr(pipeline, "fetch_probe", probe_not_found)
    monkeypatch.setattr(
        pipeline,
        "run_collection_cycle",
        lambda probe_id: pytest.fail("Collection should not start"),
    )

    with pytest.raises(SystemExit):
        pipeline.main(["--probe-id", "999999999"])

    assert "Probe 999999999 does not exist" in capsys.readouterr().err
    assert not pipeline.PROBE_STATE_PATH.exists()


def test_collection_cycle_processes_each_catalog_measurement(monkeypatch):
    captured = []
    google_available_at = datetime(
        2026, 10, 2, 12, 25, tzinfo=timezone.utc
    )

    def fake_measurement_cycle(
        measurement, probe_id, current_time, show_wait_message
    ):
        captured.append(
            {
                "measurement": measurement,
                "current_time": current_time,
                "show_wait_message": show_wait_message,
            }
        )
        if measurement["measurement_id"] == 86206926:
            return google_available_at
        return None

    monkeypatch.setattr(
        pipeline,
        "run_measurement_cycle",
        fake_measurement_cycle,
    )

    waiting_windows = pipeline.run_collection_cycle(
        PROBE_ID, show_wait_message=False
    )

    assert [
        item["measurement"] for item in captured
    ] == list(pipeline.PING_MEASUREMENTS)
    assert captured[0]["current_time"] == captured[1]["current_time"]
    assert all(not item["show_wait_message"] for item in captured)
    assert waiting_windows == {86206926: google_available_at}


def test_main_runs_polling_when_requested(monkeypatch):
    events = []

    monkeypatch.setattr(
        pipeline,
        "run_collection_cycle",
        lambda probe_id: events.append(("cycle", probe_id)),
    )
    monkeypatch.setattr(
        pipeline,
        "run_polling",
        lambda probe_id: events.append(("polling", probe_id)),
    )

    pipeline.main(["--poll"])

    assert events == [("polling", PROBE_ID)]


def test_main_runs_all_time_backfill_when_requested(monkeypatch):
    events = []

    monkeypatch.setattr(
        pipeline,
        "run_all_time_backfill",
        lambda probe_id: events.append(("all-time", probe_id)),
    )

    pipeline.main(["--all-time"])

    assert events == [("all-time", PROBE_ID)]


def test_main_rejects_poll_with_all_time():
    with pytest.raises(SystemExit):
        pipeline.main(["--poll", "--all-time"])


def test_run_polling_announces_wait_once_and_stops_cleanly(monkeypatch):
    events = []
    sleep_count = 0
    available_at = datetime(2026, 10, 2, 12, 25, tzinfo=timezone.utc)

    monkeypatch.setattr(
        pipeline,
        "load_polling_interval_seconds",
        lambda: 30,
    )
    monkeypatch.setattr(
        pipeline,
        "run_collection_cycle",
        lambda probe_id, **kwargs: (
            events.append(("cycle", probe_id, kwargs))
            or {
                1001: available_at,
                86206926: available_at,
            }
        ),
    )

    def stop_during_sleep(seconds):
        nonlocal sleep_count
        sleep_count += 1
        events.append(("sleep", seconds))
        if sleep_count == 2:
            raise KeyboardInterrupt

    monkeypatch.setattr(pipeline.time, "sleep", stop_during_sleep)
    monkeypatch.setattr(
        pipeline,
        "print_polling_started",
        lambda seconds: events.append(("started", seconds)),
    )
    monkeypatch.setattr(
        pipeline,
        "print_no_collection_interval",
        lambda **kwargs: events.append(("waiting", kwargs)),
    )
    monkeypatch.setattr(
        pipeline,
        "print_polling_stopped",
        lambda: events.append("stopped"),
    )

    pipeline.run_polling(PROBE_ID)

    assert events == [
        ("started", 30),
        ("cycle", PROBE_ID, {"show_wait_message": False}),
        (
            "waiting",
            {
                "available_at": available_at,
                "measurement_id": 1001,
                "target_name": "K-root",
            },
        ),
        (
            "waiting",
            {
                "available_at": available_at,
                "measurement_id": 86206926,
                "target_name": "Google",
            },
        ),
        ("sleep", 30),
        ("cycle", PROBE_ID, {"show_wait_message": False}),
        ("sleep", 30),
        "stopped",
    ]


def test_run_polling_keeps_operational_errors_visible(monkeypatch):
    monkeypatch.setattr(
        pipeline,
        "load_polling_interval_seconds",
        lambda: 30,
    )
    monkeypatch.setattr(
        pipeline,
        "print_polling_started",
        lambda seconds: None,
    )

    def fail_collection(probe_id, **kwargs):
        raise RuntimeError("collection failed")

    monkeypatch.setattr(pipeline, "run_collection_cycle", fail_collection)

    with pytest.raises(RuntimeError, match="collection failed"):
        pipeline.run_polling(PROBE_ID)


def test_all_time_backfill_uses_fixed_daily_blocks_and_promotes_checkpoints(
    monkeypatch,
    tmp_path,
):
    start_time = datetime(2026, 8, 26, tzinfo=timezone.utc)
    current_time = datetime(2026, 8, 28, 12, 5, tzinfo=timezone.utc)
    expected_stop = datetime(2026, 8, 28, 12, 0, tzinfo=timezone.utc)
    backfill_state_path = tmp_path / "backfill_state.json"
    collection_state_path = tmp_path / "collection_state.json"
    captured_blocks = []
    compact_summaries = []

    monkeypatch.setattr(
        pipeline, "BACKFILL_STATE_PATH", backfill_state_path
    )
    monkeypatch.setattr(
        pipeline, "COLLECTION_STATE_PATH", collection_state_path
    )
    monkeypatch.setattr(
        pipeline,
        "load_influxdb_config",
        lambda: {
            "url": "http://localhost:8086",
            "token": "test-token",
            "org": "test-org",
            "bucket": "test-bucket",
        },
    )
    monkeypatch.setattr(
        pipeline,
        "fetch_probe_first_connected",
        lambda probe_id: start_time,
    )
    monkeypatch.setattr(
        pipeline,
        "persist_measurement_window",
        lambda **kwargs: (captured_blocks.append(kwargs) or (3, 3)),
    )
    monkeypatch.setattr(pipeline, "print_backfill_started", lambda *args: None)
    monkeypatch.setattr(
        pipeline,
        "print_backfill_block",
        lambda **kwargs: compact_summaries.append(kwargs),
    )
    monkeypatch.setattr(
        pipeline, "print_backfill_completed", lambda *args: None
    )

    pipeline.run_all_time_backfill(PROBE_ID, current_time=current_time)

    expected_windows = [
        (start_time, start_time + timedelta(days=1)),
        (
            start_time + timedelta(days=1),
            start_time + timedelta(days=2),
        ),
        (start_time + timedelta(days=2), expected_stop),
    ]
    for measurement_id in (1001, 86206926):
        assert [
            (block["start_time"], block["stop_time"])
            for block in captured_blocks
            if block["measurement"]["measurement_id"] == measurement_id
        ] == expected_windows

    assert [
        (
            summary["target_name"],
            summary["block_number"],
            summary["total_blocks"],
        )
        for summary in compact_summaries
    ] == [
        ("K-root", 1, 3),
        ("K-root", 2, 3),
        ("K-root", 3, 3),
        ("Google", 1, 3),
        ("Google", 2, 3),
        ("Google", 3, 3),
    ]

    state = pipeline.load_backfill_state(backfill_state_path)
    assert state["status"] == "complete"
    assert datetime.fromisoformat(state["stop_time"]) == expected_stop
    for measurement in pipeline.PING_MEASUREMENTS:
        assert pipeline.load_last_successful_stop(
            collection_state_path,
            measurement["measurement_id"],
            PROBE_ID,
        ) == expected_stop


def test_all_time_backfill_resumes_from_own_progress(monkeypatch, tmp_path):
    start_time = datetime(2026, 8, 26, tzinfo=timezone.utc)
    stop_time = datetime(2026, 8, 28, tzinfo=timezone.utc)
    backfill_state_path = tmp_path / "backfill_state.json"
    captured_blocks = []
    compact_summaries = []
    state = pipeline.create_backfill_state(
        state_path=backfill_state_path,
        probe_id=PROBE_ID,
        bucket="test-bucket",
        start_time=start_time,
        stop_time=stop_time,
        measurement_ids=(1001, 86206926),
    )
    pipeline.save_backfill_progress(
        backfill_state_path,
        state,
        1001,
        start_time + timedelta(days=1),
    )

    monkeypatch.setattr(
        pipeline, "BACKFILL_STATE_PATH", backfill_state_path
    )
    monkeypatch.setattr(
        pipeline, "COLLECTION_STATE_PATH", tmp_path / "collection_state.json"
    )
    monkeypatch.setattr(
        pipeline,
        "load_influxdb_config",
        lambda: {
            "url": "test",
            "token": "test",
            "org": "test",
            "bucket": "test-bucket",
        },
    )
    monkeypatch.setattr(
        pipeline,
        "fetch_probe_first_connected",
        lambda probe_id: pytest.fail("Probe should not be fetched on resume"),
    )
    monkeypatch.setattr(
        pipeline,
        "persist_measurement_window",
        lambda **kwargs: (captured_blocks.append(kwargs) or (3, 3)),
    )
    monkeypatch.setattr(pipeline, "print_backfill_started", lambda *args: None)
    monkeypatch.setattr(
        pipeline,
        "print_backfill_block",
        lambda **kwargs: compact_summaries.append(kwargs),
    )
    monkeypatch.setattr(
        pipeline, "print_backfill_completed", lambda *args: None
    )

    pipeline.run_all_time_backfill(PROBE_ID)

    assert [
        block["measurement"]["measurement_id"]
        for block in captured_blocks
    ] == [1001, 86206926, 86206926]
    assert [
        (
            summary["target_name"],
            summary["block_number"],
            summary["total_blocks"],
        )
        for summary in compact_summaries
    ] == [
        ("K-root", 2, 2),
        ("Google", 1, 2),
        ("Google", 2, 2),
    ]


def test_failed_backfill_does_not_promote_operational_checkpoints(
    monkeypatch,
    tmp_path,
):
    start_time = datetime(2026, 8, 26, tzinfo=timezone.utc)
    backfill_state_path = tmp_path / "backfill_state.json"
    collection_state_path = tmp_path / "collection_state.json"

    monkeypatch.setattr(
        pipeline, "BACKFILL_STATE_PATH", backfill_state_path
    )
    monkeypatch.setattr(
        pipeline, "COLLECTION_STATE_PATH", collection_state_path
    )
    monkeypatch.setattr(
        pipeline,
        "load_influxdb_config",
        lambda: {
            "url": "test",
            "token": "test",
            "org": "test",
            "bucket": "test-bucket",
        },
    )
    monkeypatch.setattr(
        pipeline,
        "fetch_probe_first_connected",
        lambda probe_id: start_time,
    )
    monkeypatch.setattr(
        pipeline,
        "persist_measurement_window",
        lambda **kwargs: (_ for _ in ()).throw(RuntimeError("write failed")),
    )
    monkeypatch.setattr(pipeline, "print_backfill_started", lambda *args: None)

    with pytest.raises(RuntimeError, match="write failed"):
        pipeline.run_all_time_backfill(
            PROBE_ID,
            current_time=start_time + timedelta(days=1, minutes=5)
        )

    assert not collection_state_path.exists()
    state = pipeline.load_backfill_state(backfill_state_path)
    assert state["status"] == "in_progress"
    assert state["measurements"]["1001"]["next_start"] == (
        start_time.isoformat()
    )

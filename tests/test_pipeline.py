from datetime import datetime, timezone

import pytest

from ripe_atlas_tcc import pipeline


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
        lambda available_at: captured.update(available_at=available_at),
    )
    monkeypatch.setattr(
        pipeline,
        "fetch_results",
        lambda **kwargs: pytest.fail("The API should not be called"),
    )

    pipeline.main()

    assert captured == {
        "available_at": datetime(
            2026, 10, 2, 12, 25, tzinfo=timezone.utc
        ),
    }


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
        lambda result: result,
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
        pipeline.main()

    assert checkpoint_was_saved is False

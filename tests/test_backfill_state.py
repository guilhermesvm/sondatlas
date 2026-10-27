from datetime import datetime, timezone

from ripe_atlas_tcc.pipeline.backfill_state import (
    create_backfill_state,
    load_backfill_state,
    mark_backfill_complete,
    save_backfill_progress,
)


def test_backfill_state_tracks_independent_measurement_progress(tmp_path):
    state_path = tmp_path / "backfill_state.json"
    start_time = datetime(2026, 8, 26, tzinfo=timezone.utc)
    stop_time = datetime(2026, 8, 28, tzinfo=timezone.utc)

    state = create_backfill_state(
        state_path=state_path,
        probe_id=1017210,
        bucket="test-bucket",
        start_time=start_time,
        stop_time=stop_time,
        measurement_ids=(1001, 86206926),
    )
    save_backfill_progress(
        state_path=state_path,
        state=state,
        measurement_id=1001,
        next_start=datetime(2026, 8, 27, tzinfo=timezone.utc),
    )

    loaded = load_backfill_state(state_path)

    assert loaded["status"] == "in_progress"
    assert loaded["stop_time"] == "2026-08-28T00:00:00+00:00"
    assert loaded["measurements"] == {
        "1001": {"next_start": "2026-08-27T00:00:00+00:00"},
        "86206926": {"next_start": "2026-08-26T00:00:00+00:00"},
    }

    mark_backfill_complete(state_path, loaded)

    assert load_backfill_state(state_path)["status"] == "complete"

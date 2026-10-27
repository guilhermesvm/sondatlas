import json
from datetime import datetime, timezone

from ripe_atlas_tcc.pipeline.json_storage import save_normalized_results


def test_save_normalized_results_creates_expected_json_file(tmp_path):
    timestamp = datetime(2026, 10, 1, 0, 32, 42, tzinfo=timezone.utc)
    results = [
        {
            "measurement_id": 1001,
            "probe_id": 1017210,
            "timestamp": timestamp,
            "packets_sent": 3,
            "packets_received": 3,
            "packet_loss_percent": 0.0,
            "rtt_min_ms": 18.81,
            "rtt_avg_ms": 19.86,
            "rtt_max_ms": 21.12,
        }
    ]
    start_time = datetime(2026, 10, 1, 0, 30, tzinfo=timezone.utc)
    stop_time = datetime(2026, 10, 1, 0, 45, tzinfo=timezone.utc)
    output_directory = tmp_path / "data" / "normalized"

    output_path = save_normalized_results(
        results=results,
        measurement_id=1001,
        probe_id=1017210,
        start_time=start_time,
        stop_time=stop_time,
        output_directory=output_directory,
    )

    assert output_path == output_directory / (
        "measurement-1001_probe-1017210_"
        "2026-10-01_00-30-00_UTC--2026-10-01_00-45-00_UTC.json"
    )
    assert json.loads(output_path.read_text(encoding="utf-8")) == [
        {
            **results[0],
            "timestamp": "2026-10-01T00:32:42+00:00",
        }
    ]
    assert results[0]["timestamp"] is timestamp

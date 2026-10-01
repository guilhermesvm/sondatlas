import json
from datetime import datetime, timezone

from fetch_results import save_raw_results


def test_save_raw_results_creates_expected_json_file(tmp_path):
    results = [
        {
            "msm_id": 1001,
            "prb_id": 1017210,
            "timestamp": 1790729441,
        }
    ]
    start_time = datetime(2026, 9, 30, 0, 0, tzinfo=timezone.utc)
    stop_time = datetime(2026, 9, 30, 0, 15, tzinfo=timezone.utc)
    output_directory = tmp_path / "data" / "raw"

    output_path = save_raw_results(
        results=results,
        measurement_id=1001,
        probe_id=1017210,
        start_time=start_time,
        stop_time=stop_time,
        output_directory=output_directory,
    )

    assert output_path == output_directory / (
        "measurement-1001_probe-1017210_"
        "2026-09-30_00-00-00_UTC--2026-09-30_00-15-00_UTC.json"
    )
    assert output_path.exists()
    assert json.loads(output_path.read_text(encoding="utf-8")) == results

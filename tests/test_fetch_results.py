from datetime import datetime, timezone

from ripe_atlas_tcc import ripe_atlas_client


def test_fetch_results_builds_request_and_returns_response(monkeypatch):
    expected_results = [
        {
            "msm_id": 1001,
            "prb_id": 1017210,
            "timestamp": 1790729441,
        }
    ]
    expected_url = (
        "https://atlas.ripe.net/api/v2/measurements/1001/results/"
        "?probe_ids=1017210"
    )
    captured_request = {}

    class FakeResponse:
        url = expected_url
        status_checked = False

        def raise_for_status(self):
            self.status_checked = True

        def json(self):
            return expected_results

    fake_response = FakeResponse()

    def fake_get(url, params, timeout):
        captured_request["url"] = url
        captured_request["params"] = params
        captured_request["timeout"] = timeout
        return fake_response

    monkeypatch.setattr(ripe_atlas_client.requests, "get", fake_get)

    start_time = datetime(2026, 9, 30, 0, 0, tzinfo=timezone.utc)
    stop_time = datetime(2026, 9, 30, 0, 15, tzinfo=timezone.utc)

    results, request_url = ripe_atlas_client.fetch_results(
        measurement_id=1001,
        probe_id=1017210,
        start_time=start_time,
        stop_time=stop_time,
    )

    assert captured_request == {
        "url": "https://atlas.ripe.net/api/v2/measurements/1001/results/",
        "params": {
            "probe_ids": 1017210,
            "start": int(start_time.timestamp()),
            "stop": int(stop_time.timestamp()),
        },
        "timeout": 30,
    }
    assert fake_response.status_checked is True
    assert results == expected_results
    assert request_url == expected_url

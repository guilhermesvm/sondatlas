from datetime import datetime, timezone

import pytest
import requests

from sondatlas.shared import ripe_atlas_client


def test_fetch_probe_first_connected_returns_utc_datetime(monkeypatch):
    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"first_connected": 1787709821}

    monkeypatch.setattr(
        ripe_atlas_client.requests,
        "get",
        lambda url, timeout: FakeResponse(),
    )

    first_connected = ripe_atlas_client.fetch_probe_first_connected(1017210)

    assert first_connected == datetime.fromtimestamp(
        1787709821,
        tz=timezone.utc,
    )


def test_fetch_probe_first_connected_is_none_for_never_connected_probe(
    monkeypatch,
):
    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"first_connected": None}

    monkeypatch.setattr(
        ripe_atlas_client.requests,
        "get",
        lambda url, timeout: FakeResponse(),
    )

    assert ripe_atlas_client.fetch_probe_first_connected(1018246) is None


def test_fetch_probe_reports_unknown_probe(monkeypatch):
    class FakeResponse:
        status_code = 404

        def raise_for_status(self):
            pytest.fail("404 must be reported as an unknown probe")

    monkeypatch.setattr(
        ripe_atlas_client.requests,
        "get",
        lambda url, timeout: FakeResponse(),
    )

    with pytest.raises(RuntimeError, match="Probe 999 does not exist"):
        ripe_atlas_client.fetch_probe(999)


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
        status_code = 200
        headers = {}
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


class FakeResponse:
    def __init__(self, status_code, results=None, headers=None):
        self.status_code = status_code
        self.results = results or []
        self.headers = headers or {}
        self.url = "https://atlas.ripe.net/fake-results"

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f"HTTP {self.status_code}")

    def json(self):
        return self.results


def fetch_with_test_window(**kwargs):
    return ripe_atlas_client.fetch_results(
        measurement_id=1001,
        probe_id=1017210,
        start_time=datetime(2026, 10, 3, 12, 0, tzinfo=timezone.utc),
        stop_time=datetime(2026, 10, 3, 12, 5, tzinfo=timezone.utc),
        **kwargs,
    )


def test_fetch_results_retries_timeout_with_exponential_delay(monkeypatch):
    responses = [
        requests.Timeout("temporary timeout"),
        FakeResponse(200, results=[{"msm_id": 1001}]),
    ]
    sleep_delays = []

    def fake_get(*args, **kwargs):
        response = responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response

    monkeypatch.setattr(ripe_atlas_client.requests, "get", fake_get)
    monkeypatch.setattr(ripe_atlas_client.time, "sleep", sleep_delays.append)

    results, _ = fetch_with_test_window()

    assert results == [{"msm_id": 1001}]
    assert sleep_delays == [1]


def test_fetch_results_retries_temporary_http_errors(monkeypatch):
    responses = [
        FakeResponse(503),
        FakeResponse(502),
        FakeResponse(200, results=[{"msm_id": 1001}]),
    ]
    sleep_delays = []

    monkeypatch.setattr(
        ripe_atlas_client.requests,
        "get",
        lambda *args, **kwargs: responses.pop(0),
    )
    monkeypatch.setattr(ripe_atlas_client.time, "sleep", sleep_delays.append)

    results, _ = fetch_with_test_window()

    assert results == [{"msm_id": 1001}]
    assert sleep_delays == [1, 2]


def test_fetch_results_respects_retry_after_seconds(monkeypatch):
    responses = [
        FakeResponse(429, headers={"Retry-After": "7"}),
        FakeResponse(200, results=[{"msm_id": 1001}]),
    ]
    sleep_delays = []

    monkeypatch.setattr(
        ripe_atlas_client.requests,
        "get",
        lambda *args, **kwargs: responses.pop(0),
    )
    monkeypatch.setattr(ripe_atlas_client.time, "sleep", sleep_delays.append)

    fetch_with_test_window()

    assert sleep_delays == [7]


def test_fetch_results_does_not_retry_permanent_http_error(monkeypatch):
    request_count = 0
    sleep_delays = []

    def fake_get(*args, **kwargs):
        nonlocal request_count
        request_count += 1
        return FakeResponse(400)

    monkeypatch.setattr(ripe_atlas_client.requests, "get", fake_get)
    monkeypatch.setattr(ripe_atlas_client.time, "sleep", sleep_delays.append)

    with pytest.raises(requests.HTTPError, match="HTTP 400"):
        fetch_with_test_window()

    assert request_count == 1
    assert sleep_delays == []


def test_fetch_results_raises_after_last_attempt(monkeypatch):
    request_count = 0
    sleep_delays = []

    def fake_get(*args, **kwargs):
        nonlocal request_count
        request_count += 1
        raise requests.ConnectionError("temporary connection failure")

    monkeypatch.setattr(ripe_atlas_client.requests, "get", fake_get)
    monkeypatch.setattr(ripe_atlas_client.time, "sleep", sleep_delays.append)

    with pytest.raises(requests.ConnectionError):
        fetch_with_test_window()

    assert request_count == 3
    assert sleep_delays == [1, 2]

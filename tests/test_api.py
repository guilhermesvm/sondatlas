from datetime import datetime, timezone

from fastapi.testclient import TestClient
import pytest

from ripe_atlas_tcc import api


PARAMS = {
    "probe_id": 1017210,
    "measurement_id": 1001,
    "start": "2026-08-26T02:03:41Z",
    "stop": "2026-10-10T19:13:27Z",
}


@pytest.fixture
def backend(monkeypatch):
    captured = {}
    config = {
        "url": "http://localhost:8086", "org": "test-org",
        "bucket": "test-bucket", "token": "secret-test-token",
    }

    def load_config():
        captured["config_loaded"] = True
        return config

    def query(**kwargs):
        captured["query"] = kwargs
        return []

    monkeypatch.setattr(api, "load_influxdb_config", load_config)
    monkeypatch.setattr(api, "query_ping_results", query)
    with TestClient(api.app) as client:
        yield client, captured, config


def test_targets_identifies_configured_measurements_without_database(backend):
    client, captured, _ = backend
    response = client.get("/targets")
    assert response.status_code == 200
    assert response.json() == {
        "probe_id": 1017210,
        "targets": [
            {"measurement_id": 1001, "target_name": "K-root",
             "measurement_category": "built-in"},
            {"measurement_id": 86206926, "target_name": "Google",
             "measurement_category": "well-known"},
        ],
    }
    assert captured == {}


def test_ping_serializes_results_and_nulls_and_keeps_credentials_in_backend(
    backend, monkeypatch,
):
    client, captured, config = backend
    results = [
        {"timestamp": "2026-08-26T02:04:43Z", "probe_id": 1017210,
         "measurement_id": 1001, "target_name": "K-root",
         "packets_sent": 3, "packets_received": 0,
         "packet_loss_percent": 100.0, "rtt_min_ms": None,
         "rtt_avg_ms": None, "rtt_max_ms": None},
        {"timestamp": "2026-08-26T02:08:43Z", "probe_id": 1017210,
         "measurement_id": 1001, "target_name": "K-root",
         "packets_sent": 0, "packets_received": 0,
         "packet_loss_percent": None, "rtt_min_ms": None,
         "rtt_avg_ms": None, "rtt_max_ms": None},
    ]

    def query(**kwargs):
        captured["query"] = kwargs
        return results

    monkeypatch.setattr(api, "query_ping_results", query)
    response = client.get("/ping", params=PARAMS)
    assert response.status_code == 200
    assert response.json() == {
        **PARAMS, "count": 2, "results": results,
    }
    assert '"rtt_avg_ms":null' in response.text
    assert "secret-test-token" not in response.text
    assert "test-bucket" not in response.text
    assert captured["query"] == {
        **config, "probe_id": 1017210, "measurement_id": 1001,
        "start_time": datetime(2026, 8, 26, 2, 3, 41, tzinfo=timezone.utc),
        "stop_time": datetime(2026, 10, 10, 19, 13, 27, tzinfo=timezone.utc),
    }


def test_empty_period_is_success_not_database_error(backend):
    client, captured, _ = backend
    response = client.get("/ping", params=PARAMS)
    assert response.status_code == 200
    assert response.json() == {**PARAMS, "count": 0, "results": []}
    assert "query" in captured


def test_google_and_default_probe_and_offset_dates(backend):
    client, captured, _ = backend
    response = client.get("/ping", params={
        "measurement_id": 86206926,
        "start": "2026-08-26T00:03:41-02:00",
        "stop": "2026-08-27T02:03:41Z",
    })
    assert response.status_code == 200
    assert response.json()["start"] == PARAMS["start"]
    assert response.json()["probe_id"] == 1017210
    assert captured["query"]["measurement_id"] == 86206926
    assert captured["query"]["start_time"].tzinfo == timezone.utc


@pytest.mark.parametrize("overrides", [
    {"probe_id": 0}, {"probe_id": "abc"},
    {"measurement_id": -1}, {"measurement_id": "1.5"},
    {"start": "invalid"}, {"start": "2026-08-26T02:03:41"},
    {"stop": "2026-10-10T19:13:27"},
    {"stop": PARAMS["start"]}, {"stop": "2026-08-25T02:03:41Z"},
    {"stop": "2027-08-26T02:03:41Z"},
])
def test_invalid_parameters_return_422_before_accessing_database(backend, overrides):
    client, captured, _ = backend
    response = client.get("/ping", params={**PARAMS, **overrides})
    assert response.status_code == 422
    assert captured == {}


@pytest.mark.parametrize("missing", ["measurement_id", "start", "stop"])
def test_required_parameters_return_422(backend, missing):
    client, captured, _ = backend
    response = client.get("/ping", params={
        key: value for key, value in PARAMS.items() if key != missing
    })
    assert response.status_code == 422
    assert captured == {}


@pytest.mark.parametrize("path,overrides", [
    ("/targets", {"probe_id": 123}),
    ("/ping", {"probe_id": 123}),
    ("/ping", {"measurement_id": 5001}),
])
def test_unconfigured_probe_or_measurement_returns_404(backend, path, overrides):
    client, captured, _ = backend
    response = client.get(path, params={**PARAMS, **overrides})
    assert response.status_code == 404
    assert captured == {}


def test_sixty_day_limit_is_inclusive(backend):
    client, captured, _ = backend
    response = client.get("/ping", params={
        **PARAMS, "start": "2026-08-26T00:00:00Z", "stop": "2026-10-25T00:00:00Z",
    })
    assert response.status_code == 200
    assert "query" in captured


@pytest.mark.parametrize("failure", ["load_influxdb_config", "query_ping_results"])
def test_database_or_configuration_failure_returns_safe_503(
    backend, monkeypatch, caplog, failure,
):
    client, _, _ = backend

    def fail(**kwargs):
        raise RuntimeError("secret-test-token test-bucket")

    monkeypatch.setattr(api, failure, fail)
    response = client.get("/ping", params=PARAMS)
    assert response.status_code == 503
    assert response.json() == {"detail": "Ping history is temporarily unavailable"}
    assert "secret-test-token" not in response.text + caplog.text
    assert "test-bucket" not in response.text + caplog.text
    assert "probe 1017210, measurement 1001" in caplog.text


def test_api_has_no_write_routes(backend):
    client, _, _ = backend
    assert client.post("/ping", json=PARAMS).status_code == 405
    assert client.delete("/targets").status_code == 405

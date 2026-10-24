from datetime import datetime, timezone

from fastapi.testclient import TestClient
import pytest
import requests

from ripe_atlas_tcc import api
from ripe_atlas_tcc.probe_state import save_selected_probe


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
    monkeypatch.setattr(api, "load_selected_probe", lambda path: 1017210)
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


@pytest.mark.parametrize("path", ["/targets", "/ping"])
def test_no_selected_probe_returns_404(backend, monkeypatch, path):
    client, captured, _ = backend
    monkeypatch.setattr(api, "load_selected_probe", lambda path: None)
    response = client.get(path, params=PARAMS)
    assert response.status_code == 404
    assert response.json() == {"detail": "No probe selected"}
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


def test_ping_and_target_routes_are_read_only(backend):
    client, _, _ = backend
    assert client.post("/ping", json=PARAMS).status_code == 405
    assert client.delete("/targets").status_code == 405


def test_distribution_contract_and_failures_preserve_saved_data(backend, monkeypatch, tmp_path):
    client, captured, _ = backend
    study = api.probe_distribution
    monkeypatch.setattr(study, "OUTPUT_DIR", tmp_path)
    monkeypatch.setattr(study, "_run_collection", study._collect_summary)
    assert client.get("/probe-distribution").json() == {"distribution": None}
    data = {
        "started_at_utc": "2026-10-11T12:00:00Z", "finished_at_utc": "2026-10-11T12:01:00Z",
        "source": study.QUERY_URL, "pages": [{"response": {
            "count": 1, "next": None, "results": [{"id": 1, "country_code": "BR", "asn_v4": None}],
        }}],
    }
    monkeypatch.setattr(study, "fetch_snapshot", lambda deadline: data)
    response = client.post("/probe-distribution/refresh")
    assert response.status_code == 200
    saved = response.json()
    assert saved["distribution"]["total_probes"] == 1
    assert "pages" not in saved["distribution"]
    assert client.get("/probe-distribution").json() == saved
    with study.execution_lock(tmp_path / ".refresh.lock"):
        assert client.post("/probe-distribution/refresh").status_code == 409
        assert client.get("/probe-distribution").json() == saved
        assert client.get("/ping", params=PARAMS).status_code == 200
    for exception, status in [(ValueError("private details"), 503), (TimeoutError("private details"), 504)]:
        def fail(deadline):
            raise exception
        monkeypatch.setattr(study, "fetch_snapshot", fail)
        response = client.post("/probe-distribution/refresh")
        assert response.status_code == status
        assert "private details" not in response.text
        assert client.get("/probe-distribution").json() == saved
    assert captured["query"]["measurement_id"] == 1001


def test_distribution_refresh_does_not_block_ping_or_accept_concurrent_collection(backend, monkeypatch, tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event

    client, _, _ = backend
    study = api.probe_distribution
    monkeypatch.setattr(study, "OUTPUT_DIR", tmp_path)
    monkeypatch.setattr(study, "_run_collection", study._collect_summary)
    started, finish = Event(), Event()

    def collect(deadline):
        started.set()
        assert finish.wait(5)
        raise ValueError("controlled failure")

    monkeypatch.setattr(study, "fetch_snapshot", collect)
    with ThreadPoolExecutor(max_workers=1) as executor:
        pending = executor.submit(client.post, "/probe-distribution/refresh")
        try:
            assert started.wait(5)
            assert client.get("/ping", params=PARAMS).status_code == 200
            assert client.get("/probe-distribution").json() == {"distribution": None}
            assert client.post("/probe-distribution/refresh").status_code == 409
        finally:
            finish.set()
        assert pending.result(timeout=5).status_code == 503


@pytest.fixture
def probe_api(monkeypatch, tmp_path):
    state_path = tmp_path / "state" / "probe.json"
    checked = []

    def fetch_probe(probe_id):
        checked.append(probe_id)
        if probe_id == 404:
            raise RuntimeError("Probe 404 does not exist in RIPE Atlas")
        if probe_id == 503:
            raise requests.ConnectionError("offline")
        return {"id": probe_id, "is_public": probe_id != 1002642}

    monkeypatch.setattr(api, "PROBE_STATE_PATH", state_path)
    monkeypatch.setattr(api, "fetch_probe", fetch_probe)
    with TestClient(api.app) as client:
        yield client, state_path, checked


def test_probe_selection_is_checked_saved_and_read_back(probe_api):
    client, state_path, checked = probe_api
    assert client.get("/probe").json() == {"probe_id": None}

    response = client.put("/probe", json={"probe_id": 1002642})
    assert response.status_code == 200
    assert response.json() == {"probe_id": 1002642, "is_public": False}
    assert checked == [1002642]
    assert client.get("/probe").json() == {"probe_id": 1002642}
    assert api.load_selected_probe(state_path) == 1002642


@pytest.mark.parametrize("probe_id, status", [(404, 404), (503, 503)])
def test_failed_probe_check_keeps_previous_selection(probe_api, probe_id, status):
    client, state_path, _ = probe_api
    save_selected_probe(state_path, 1017210)
    assert client.put("/probe", json={"probe_id": probe_id}).status_code == status
    assert client.get("/probe").json() == {"probe_id": 1017210}


@pytest.mark.parametrize("body", [{"probe_id": 0}, {"probe_id": "abc"}, {}])
def test_invalid_probe_id_returns_422_without_asking_ripe(probe_api, body):
    client, state_path, checked = probe_api
    assert client.put("/probe", json=body).status_code == 422
    assert checked == []
    assert not state_path.exists()


def test_stop_following_removes_the_selection_and_can_repeat(probe_api):
    client, state_path, checked = probe_api
    save_selected_probe(state_path, 1017210)
    for _ in range(2):
        response = client.delete("/probe")
        assert response.status_code == 200
        assert response.json() == {"probe_id": None}
    assert client.get("/probe").json() == {"probe_id": None}
    assert not state_path.exists()
    assert checked == []

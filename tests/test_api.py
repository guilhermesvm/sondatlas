from datetime import datetime, timezone
import threading

from fastapi.testclient import TestClient
import pytest
import requests

from ripe_atlas_tcc import api, atlas_account
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


@pytest.fixture
def account_api(monkeypatch, tmp_path):
    state_path = tmp_path / "state" / "atlas-account.json"
    calls = []

    class Response:
        def __init__(self, status_code, body=None):
            self.status_code = status_code
            self.body = body

        def json(self):
            return self.body

        def raise_for_status(self):
            if self.status_code >= 400:
                raise requests.HTTPError(str(self.status_code))

    def get(url, headers, timeout):
        calls.append((url, headers["Authorization"]))
        key = headers["Authorization"].removeprefix("Key ")
        if key == "offline-key":
            raise requests.ConnectionError("offline")
        if key not in ("good-key", "probes-only-key", "credits-only-key", "no-schedule-key", "no-list-key"):
            return Response(403, {"detail": "refused"})
        if "/measurements/my/" in url:
            if key == "no-list-key":
                return Response(403, {"detail": "no permission"})
            return Response(200, {"count": 0, "results": []})
        if url.endswith("/credits/income-items/"):
            return Response(200, {"groups": {"hosted_probes": [{
                "probe_id": 1017210, "probe": "https://atlas.ripe.net/api/v2/probes/1017210/", "description": "Casa",
                "max_daily_connected_income": 21600, "estimated_daily_income": "35261", "yesterday_results_reward": 13661,
            }], "sponsored_probes": []}, "total_estimated_daily_income": 35261})
        if url.endswith("/credits/"):
            if key == "probes-only-key":
                return Response(403, {"detail": "no permission"})
            return Response(200, {"current_balance": 1206887, "estimated_daily_income": 21600, "max_daily_credits": 1000000})
        if key == "credits-only-key":
            return Response(403, {"detail": "no permission"})
        return Response(200, {"count": 1, "results": [{
            "id": 1017210, "description": "Casa", "is_public": True,
            "status": {"id": 1, "name": "Connected", "since": "2026-10-26T13:39:08Z"},
            "first_connected": 1787709821, "total_uptime": 2815592,
            "address_v4": "203.0.113.77", "prefix_v4": "203.0.113.0/24", "asn_v4": 64500,
        }]})

    def post(url, headers, json, timeout):
        calls.append(("POST " + url, headers["Authorization"]))
        key = headers["Authorization"].removeprefix("Key ")
        if key == "offline-key":
            raise requests.ConnectionError("offline")
        if json != {}:
            raise AssertionError("the permission check must not create anything")
        if key in ("good-key", "probes-only-key", "credits-only-key", "no-list-key"):
            return Response(400, {"error": {"detail": "definitions: This field is required."}})
        return Response(403, {"detail": "no permission"})

    monkeypatch.setattr(api, "ACCOUNT_STATE_PATH", state_path)
    monkeypatch.setattr(atlas_account.requests, "get", get)
    monkeypatch.setattr(atlas_account.requests, "post", post)
    with TestClient(api.app) as client:
        yield client, state_path, calls


def test_account_key_is_checked_saved_and_never_returned(account_api):
    client, state_path, calls = account_api
    assert client.get("/account").json() == {"connected": False}
    assert calls == []

    responses = [client.put("/account", json={"key": " good-key "}), client.get("/account")]
    for response in responses:
        assert response.status_code == 200
        assert response.json() == {"connected": True, "probes": [{
            "id": 1017210, "description": "Casa", "is_public": True,
            "status": {"id": 1, "name": "Connected", "since": "2026-10-26T13:39:08Z"},
            "first_connected": 1787709821, "total_uptime": 2815592, "asn_v4": 64500,
        }], "credits": {"current_balance": 1206887, "estimated_daily_income": 21600},
            "income": [{"probe_id": 1017210, "estimated_daily_income": 35261.0, "yesterday_results_reward": 13661}],
            "missing_permissions": []}
        assert "good-key" not in response.text
        assert "203.0.113" not in response.text
    assert sorted(calls) == sorted([
        ("https://atlas.ripe.net/api/v2/credits/", "Key good-key"),
        ("POST https://atlas.ripe.net/api/v2/measurements/", "Key good-key"),
        ("https://atlas.ripe.net/api/v2/measurements/my/?page_size=1&fields=id", "Key good-key"),
        ("https://atlas.ripe.net/api/v2/probes/my/", "Key good-key"),
        ("https://atlas.ripe.net/api/v2/credits/income-items/", "Key good-key"),
    ] * 2)
    assert atlas_account.load_key(state_path) == "good-key"


@pytest.mark.parametrize("key, status", [("bad-key", 422), ("offline-key", 503), ("   ", 422)])
def test_refused_or_unchecked_key_keeps_the_previous_one(account_api, key, status):
    client, state_path, _ = account_api
    atlas_account.save_key(state_path, "good-key")
    assert client.put("/account", json={"key": key}).status_code == status
    assert atlas_account.load_key(state_path) == "good-key"


@pytest.mark.parametrize("key, status", [("bad-key", 403), ("offline-key", 503)])
def test_saved_key_refused_later_or_ripe_offline(account_api, key, status):
    client, state_path, _ = account_api
    atlas_account.save_key(state_path, key)
    response = client.get("/account")
    assert response.status_code == status
    assert key not in response.text


def test_disconnecting_removes_the_key_and_can_repeat(account_api):
    client, state_path, calls = account_api
    atlas_account.save_key(state_path, "good-key")
    for _ in range(2):
        response = client.delete("/account")
        assert response.status_code == 200
        assert response.json() == {"connected": False}
    assert not state_path.exists()
    assert client.get("/account").json() == {"connected": False}
    assert calls == []


@pytest.mark.parametrize("key, missing", [("probes-only-key", "credits"), ("credits-only-key", "probes"), ("no-schedule-key", "measurements"), ("no-list-key", "my_measurements")])
def test_key_missing_one_permission_is_not_linked_and_says_which(account_api, key, missing):
    client, state_path, _ = account_api
    response = client.put("/account", json={"key": key})
    assert response.status_code == 422
    assert response.json() == {"detail": {"missing_permissions": [missing]}}
    assert not state_path.exists()


def test_saved_key_without_the_credits_permission_still_lists_probes(account_api):
    client, state_path, _ = account_api

    atlas_account.save_key(state_path, "probes-only-key")
    account = client.get("/account").json()
    assert [probe["id"] for probe in account["probes"]] == [1017210]
    assert account["credits"] is None
    assert account["income"] is None
    assert account["missing_permissions"] == ["credits"]


def test_account_checks_run_at_the_same_time(monkeypatch):
    together = threading.Barrier(5, timeout=5)

    def waits_for_the_others(answer):
        def check(key):
            together.wait()
            return answer
        return check

    monkeypatch.setattr(atlas_account, "fetch_credits", waits_for_the_others({"current_balance": 1, "estimated_daily_income": None}))
    monkeypatch.setattr(atlas_account, "can_schedule", waits_for_the_others(True))
    monkeypatch.setattr(atlas_account, "can_list", waits_for_the_others(True))
    monkeypatch.setattr(atlas_account, "fetch_my_probes", waits_for_the_others([]))
    monkeypatch.setattr(atlas_account, "fetch_income", waits_for_the_others([]))
    assert atlas_account.fetch_account("good-key")["missing_permissions"] == []


@pytest.fixture
def challenge_api(monkeypatch, tmp_path):
    state_path = tmp_path / "state" / "atlas-account.json"
    created = []
    answer = {"status": 201, "body": {"measurements": [123456789]}}

    class Response:
        def __init__(self, status_code, body):
            self.status_code = status_code
            self.body = body

        def json(self):
            return self.body

        def raise_for_status(self):
            if self.status_code >= 400:
                raise requests.HTTPError(str(self.status_code))

    def get(url, headers, timeout):
        return Response(200, {"results": [{"id": 1017210, "status": {"id": 1}}]})

    def post(url, headers, json, timeout):
        created.append((url, headers["Authorization"], json))
        return Response(answer["status"], answer["body"])

    monkeypatch.setattr(api, "ACCOUNT_STATE_PATH", state_path)
    monkeypatch.setattr(atlas_account.requests, "get", get)
    monkeypatch.setattr(atlas_account.requests, "post", post)
    atlas_account.save_key(state_path, "good-key")
    with TestClient(api.app, base_url="http://127.0.0.1:8000") as client:
        yield client, state_path, created, answer


def test_ping_challenge_creates_one_public_one_off_ping_from_the_account_probe(challenge_api):
    client, _, created, _ = challenge_api
    response = client.post("/challenges/ping", json={"probe_id": 1017210, "target": " Google.com "})
    assert response.status_code == 200
    assert response.json() == {"measurement_id": 123456789}
    assert "good-key" not in response.text
    assert created == [("https://atlas.ripe.net/api/v2/measurements/", "Key good-key", {
        "definitions": [{"type": "ping", "af": 4, "target": "google.com", "packets": 3, "description": "Sondatlas: ping para google.com", "tags": ["sondatlas"], "resolve_on_probe": True}],
        "probes": [{"type": "probes", "value": "1017210", "requested": 1}],
        "is_oneoff": True,
    })]
    client.post("/challenges/ping", json={"probe_id": 1017210, "target": "8.8.8.8", "packets": 10, "description": " Meu teste "})
    assert created[1][2]["definitions"][0] == {"type": "ping", "af": 4, "target": "8.8.8.8", "packets": 10, "description": "Meu teste", "tags": ["sondatlas"]}


@pytest.mark.parametrize("headers, body, status", [
    ({"Host": "evil.example"}, {"probe_id": 1017210, "target": "google.com"}, 403),
    ({}, {"probe_id": 1018246, "target": "google.com"}, 422),
    ({}, {"probe_id": 1017210, "target": "192.168.1.1"}, 422),
    ({}, {"probe_id": 1017210, "target": "http://google.com"}, 422),
    ({}, {"probe_id": 1017210, "target": "google.com", "packets": 17}, 422),
    ({}, {"probe_id": 1017210, "target": "google.com", "description": "x" * 101}, 422),
])
def test_ping_challenge_refuses_foreign_hosts_other_probes_and_bad_targets_without_spending(challenge_api, headers, body, status):
    client, _, created, _ = challenge_api
    assert client.post("/challenges/ping", json=body, headers=headers).status_code == status
    assert created == []


def test_ping_challenge_needs_a_linked_account(challenge_api):
    client, state_path, created, _ = challenge_api
    atlas_account.delete_key(state_path)
    assert client.post("/challenges/ping", json={"probe_id": 1017210, "target": "google.com"}).status_code == 409
    assert created == []


@pytest.mark.parametrize("status, body, detail", [
    (403, {"error": {"detail": "no permission"}}, {"missing_permissions": ["measurements"]}),
    (400, {"error": {"detail": "Bad request", "errors": [{"detail": "Not enough credits"}]}}, {"ripe_error": "Bad request Not enough credits"}),
])
def test_ping_challenge_explains_what_ripe_refused(challenge_api, status, body, detail):
    client, _, _, answer = challenge_api
    answer.update(status=status, body=body)
    response = client.post("/challenges/ping", json={"probe_id": 1017210, "target": "google.com"})
    assert response.status_code == 422
    assert response.json() == {"detail": detail}


def test_challenge_list_shows_only_the_sondatlas_measurements_of_the_account(challenge_api, monkeypatch):
    client, _, created, _ = challenge_api
    asked = []

    class Response:
        status_code = 200

        def json(self):
            return {"count": 61, "results": [{
                "id": 228260804, "type": "ping", "target": "github.com", "creation_time": 1793110783,
                "probes": [{"id": 1017210, "url": "https://atlas.ripe.net/api/v2/probes/1017210/"}],
            }]}

        def raise_for_status(self):
            pass

    def get(url, headers, timeout):
        asked.append((url, headers["Authorization"]))
        return Response()

    monkeypatch.setattr(atlas_account.requests, "get", get)
    response = client.get("/challenges")
    assert response.status_code == 200
    assert response.json() == {"count": 61, "challenges": [
        {"id": 228260804, "type": "ping", "target": "github.com", "created": 1793110783, "probe_id": 1017210},
    ]}
    assert "good-key" not in response.text
    assert asked == [("https://atlas.ripe.net/api/v2/measurements/my/?tags=sondatlas&sort=-id&page_size=50"
                      "&fields=id,type,target,creation_time,probes&optional_fields=probes", "Key good-key")]
    assert created == []


@pytest.mark.parametrize("status, expected, detail", [
    (403, 422, {"missing_permissions": ["my_measurements"]}),
    (502, 503, "RIPE Atlas is unavailable"),
])
def test_challenge_list_says_what_is_missing_or_unavailable(challenge_api, monkeypatch, status, expected, detail):
    client, state_path, _, _ = challenge_api

    class Response:
        status_code = status

        def raise_for_status(self):
            raise requests.HTTPError(str(status))

    monkeypatch.setattr(atlas_account.requests, "get", lambda url, headers, timeout: Response())
    response = client.get("/challenges")
    assert response.status_code == expected
    assert response.json() == {"detail": detail}
    atlas_account.delete_key(state_path)
    assert client.get("/challenges").status_code == 409

import json

import pytest

from ripe_atlas_tcc import probe_distribution as study


@pytest.fixture
def inline_collection(monkeypatch):
    monkeypatch.setattr(study, "_run_collection", study._collect_summary)


def probe(probe_id, country="BR", asn=263077):
    return {"id": probe_id, "country_code": country, "asn_v4": asn,
            "is_public": True, "status": {"id": 1}}


def snapshot(*pages):
    return {"started_at_utc": "2026-10-11T12:00:00Z", "finished_at_utc": "2026-10-11T12:01:00Z",
            "source": study.QUERY_URL, "pages": [{"response": page} for page in pages]}


def test_follows_pagination_and_preserves_original_pages(monkeypatch):
    next_url = study.QUERY_URL + "&page=2"
    pages = [{"count": 2, "next": next_url, "results": [probe(1)]},
             {"count": 2, "next": None, "results": [probe(2)]}]
    calls = []
    sessions = []

    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return pages[len(calls) - 1]

    def get(session, url, timeout):
        calls.append(url)
        sessions.append(session)
        assert timeout == 30
        return Response()

    monkeypatch.setattr(study.requests.Session, "get", get)
    result = study.fetch_snapshot()
    assert calls == [study.QUERY_URL, next_url]
    assert [p["response"] for p in result["pages"]] == pages
    assert sessions[0] is sessions[1]


def test_counts_unique_probes_asns_and_missing_metadata():
    result = study.summarize_snapshot(snapshot(
        {"count": 4, "results": [probe(1), probe(2), probe(3, "US", None)]},
        {"count": 4, "results": [probe(2), probe(4, None, None)]},
    ))
    assert result["total_probes"] == 4
    assert result["duplicate_records"] == 1
    assert result["countries"][0] == {"country_code": "BR", "probes": 2,
        "share_percent": 50, "ipv4_asns": 1, "missing_ipv4_asn": 0}
    assert result["country_codes_with_probes"] == 2
    assert sum(row["probes"] for row in result["countries"]) == 4


def test_summary_discloses_pagination_drift_and_distinguishes_no_collection_from_zero():
    data = snapshot({"count": 2, "results": [probe(1, "US")]})
    summary = study.summarize_snapshot(data)
    result = study.dashboard_summary(data, summary, "test")
    assert result["count_mismatch"] is True
    assert result["api_count_min"] == result["api_count_max"] == 2
    assert result["brazil"] == {"country_code": "BR", "probes": 0, "share_percent": 0}
    empty = snapshot({"count": 0, "results": []})
    result = study.dashboard_summary(empty, study.summarize_snapshot(empty), "empty")
    assert result["total_probes"] == 0
    assert result["brazil"]["share_percent"] is None
    assert result["count_mismatch"] is False


def test_rejects_unexpected_pagination_endpoint(monkeypatch):
    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return {"count": 0, "results": [], "next": "https://example.com/probes/"}

    monkeypatch.setattr(study.requests.Session, "get", lambda *args, **kwargs: Response())
    with pytest.raises(ValueError, match="pagination endpoint"):
        study.fetch_snapshot()


def test_rejects_out_of_scope_probes(monkeypatch):
    private = {**probe(1), "is_public": False}

    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return {"count": 1, "results": [private], "next": None}

    monkeypatch.setattr(study.requests.Session, "get", lambda *args, **kwargs: Response())
    with pytest.raises(ValueError, match="outside"):
        study.fetch_snapshot()


def test_reads_saved_summary_without_external_request(tmp_path, monkeypatch):
    assert study.read_distribution(tmp_path) is None
    data = snapshot({"count": 2, "next": None, "results": [probe(1), probe(2, "US")]})
    saved = study.dashboard_summary(data, study.summarize_snapshot(data), "2026-10-11_12-01-00_UTC")
    (tmp_path / "latest.json").write_text(json.dumps(saved), encoding="utf-8")
    monkeypatch.setattr(study.requests.Session, "get", lambda *a, **k: pytest.fail("GET must not collect"))
    result = study.read_distribution(tmp_path)
    assert result["total_probes"] == 2
    assert result["brazil"]["probes"] == 1
    assert result["brazil"]["share_percent"] == 50
    assert "pages" not in result
    assert result["started_at_utc"] == data["started_at_utc"]


def test_refresh_replaces_only_summary_and_preserves_previous_on_failure(tmp_path, monkeypatch, inline_collection):
    data = snapshot({"count": 1, "next": None, "results": [probe(1)]})
    monkeypatch.setattr(study, "fetch_snapshot", lambda deadline: data)
    first = study.refresh_distribution(tmp_path)
    assert study.read_distribution(tmp_path) == first
    reference = (tmp_path / "latest.json").read_bytes()
    original_replace = study.os.replace
    assert json.loads(reference) == first
    assert {path.name for path in tmp_path.iterdir()} == {"latest.json", ".refresh.lock.guard"}
    second = study.refresh_distribution(tmp_path)
    assert study.read_distribution(tmp_path) == second
    assert {path.name for path in tmp_path.iterdir()} == {"latest.json", ".refresh.lock.guard"}
    reference = (tmp_path / "latest.json").read_bytes()

    def fail_publication(source, destination):
        assert study.read_distribution(tmp_path) == second
        assert source == tmp_path / "latest.tmp"
        assert destination == tmp_path / "latest.json"
        assert json.loads(source.read_text())["total_probes"] == 1
        raise OSError("publication failed")

    monkeypatch.setattr(study.os, "replace", fail_publication)
    with pytest.raises(OSError):
        study.refresh_distribution(tmp_path)
    assert (tmp_path / "latest.json").read_bytes() == reference
    assert study.read_distribution(tmp_path) == second
    assert not (tmp_path / "latest.tmp").exists()
    monkeypatch.setattr(study.os, "replace", original_replace)
    monkeypatch.setattr(type(tmp_path), "write_text", lambda *args, **kwargs: (_ for _ in ()).throw(OSError("disk full")))
    with pytest.raises(OSError):
        study.refresh_distribution(tmp_path)
    assert (tmp_path / "latest.json").read_bytes() == reference
    assert study.read_distribution(tmp_path) == second
    assert {path.name for path in tmp_path.iterdir()} == {"latest.json", ".refresh.lock.guard"}


def test_cooperative_deadline_stops_next_page_without_publishing(tmp_path, monkeypatch, inline_collection):
    elapsed = [0]
    monkeypatch.setattr(study.time, "monotonic", lambda: elapsed[0])

    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            elapsed[0] = study.MAX_COLLECTION_SECONDS + 1
            return {"count": 1, "results": [probe(1)], "next": study.QUERY_URL + "&page=2"}

    calls = []
    monkeypatch.setattr(study.requests.Session, "get", lambda session, url, timeout: calls.append(timeout) or Response())
    with pytest.raises(TimeoutError):
        study.refresh_distribution(tmp_path)
    assert calls == [30]
    assert study.read_distribution(tmp_path) is None
    assert not (tmp_path / "latest.json").exists()


def test_deadline_interrupts_live_download_preserves_saved_data_and_allows_retry(tmp_path, monkeypatch, capfd):
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    from threading import Event, Thread
    import time

    from fastapi.testclient import TestClient
    from ripe_atlas_tcc import api

    data = snapshot({"count": 1, "next": None, "results": [probe(1)]})
    with monkeypatch.context() as seed:
        seed.setattr(study, "_run_collection", study._collect_summary)
        seed.setattr(study, "fetch_snapshot", lambda deadline: data)
        previous = study.refresh_distribution(tmp_path)
    reference = (tmp_path / "latest.json").read_bytes()
    started, disconnected = Event(), Event()
    slow = [True]

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            body = json.dumps({"count": 2, "next": None, "results": [probe(1), probe(2, "US")]}).encode() + b" " * 4096
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            started.set()
            try:
                if slow[0]:
                    for offset in range(0, len(body), 16):
                        self.wfile.write(body[offset:offset + 16])
                        self.wfile.flush()
                        time.sleep(0.03)
                else:
                    self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                disconnected.set()

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    thread = Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
    thread.start()
    processes = []
    original_popen = study.subprocess.Popen
    local_url = f"http://127.0.0.1:{server.server_port}/"
    bootstrap = (
        "import requests,runpy; original=requests.Session.get; "
        f"requests.Session.get=lambda self,url,**kwargs: original(self,{local_url!r},**kwargs); "
        "runpy.run_module('ripe_atlas_tcc.probe_distribution',run_name='__main__')"
    )

    def launch(command, **kwargs):
        process = original_popen([command[0], "-c", bootstrap, *command[-2:]], **kwargs)
        processes.append(process)
        return process

    monkeypatch.setattr(study.subprocess, "Popen", launch)
    monkeypatch.setattr(study, "OUTPUT_DIR", tmp_path)
    monkeypatch.setattr(study, "MAX_COLLECTION_SECONDS", 1)
    try:
        with TestClient(api.app) as client:
            before = time.monotonic()
            with capfd.disabled():
                response = client.post("/probe-distribution/refresh")
            elapsed = time.monotonic() - before
            assert response.status_code == 504
            assert started.is_set(), "The timeout must interrupt an in-flight response"
            assert elapsed < 1.8, f"Collection exceeded its one-second budget: {elapsed:.3f}s"
            assert disconnected.wait(1)
            assert processes[-1].poll() is not None
            assert not (tmp_path / ".refresh.lock").exists()
            assert (tmp_path / "latest.json").read_bytes() == reference
            assert client.get("/probe-distribution").json() == {"distribution": previous}
            slow[0] = False
            monkeypatch.setattr(study, "MAX_COLLECTION_SECONDS", 3)
            with capfd.disabled():
                response = client.post("/probe-distribution/refresh")
            assert response.status_code == 200
            assert response.json()["distribution"]["total_probes"] == 2
            assert client.get("/probe-distribution").json() == response.json()
            assert processes[-1].poll() == 0
            print(f"Slow-download deadline: {elapsed:.3f}s; worker stopped; retry succeeded.")
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=1)

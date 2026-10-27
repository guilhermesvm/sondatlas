from datetime import datetime, timedelta, timezone
import json
import traceback

from influxdb_client.client.flux_table import FluxRecord, FluxTable
import pytest

from ripe_atlas_tcc.api import influxdb_queries


START = datetime(2026, 8, 26, tzinfo=timezone.utc)
STOP = START + timedelta(days=1)


def query(**overrides):
    arguments = {
        "probe_id": 1017210,
        "measurement_id": 1001,
        "start_time": START,
        "stop_time": STOP,
        "url": "http://localhost:8086",
        "token": "secret-test-token",
        "org": "test-org",
        "bucket": 'bucket-with-"quotes',
    }
    arguments.update(overrides)
    return influxdb_queries.query_ping_results(**arguments)


def make_table(*rows):
    table = FluxTable()
    for values in rows:
        record = FluxRecord(table=0)
        record.values = {
            "_time": START,
            "probe_id": "1017210",
            "measurement_id": "1001",
            "target_name": "K-root",
            "measurement_category": "built-in",
            "address_family": "4",
            "protocol": "ICMP",
            "destination_name": "k.root-servers.net",
            "destination_address": "193.0.14.129",
            "packets_sent": 3,
            "packets_received": 3,
            "duplicate_packets": 0,
            "packet_loss_percent": 0.0,
            "rtt_min_ms": 18.0,
            "rtt_avg_ms": 19.0,
            "rtt_max_ms": 20.0,
            **values,
        }
        table.records.append(record)
    return table


def fake_client(monkeypatch, tables=None, error=None):
    captured = {}

    class FakeQueryApi:
        def query(self, **kwargs):
            captured["query"] = kwargs
            if error:
                raise error
            return tables or []

    class FakeClient:
        def __init__(self, **kwargs):
            captured["client"] = kwargs

        def __enter__(self):
            return self

        def __exit__(self, *args):
            captured["closed"] = True

        def query_api(self):
            return FakeQueryApi()

    monkeypatch.setattr(influxdb_queries, "InfluxDBClient", FakeClient)
    return captured


def test_query_binds_filters_and_utc_bounds(monkeypatch):
    captured = fake_client(monkeypatch)
    offset = timezone(timedelta(hours=-3))
    assert query(start_time=START.astimezone(offset)) == []
    assert captured["query"]["params"] == {
        "bucket": 'bucket-with-"quotes',
        "influx_measurement": "ripe_atlas_ping",
        "probe_id": "1017210",
        "measurement_id": "1001",
        "start_time": START,
        "stop_time": STOP,
    }
    flux = captured["query"]["query"]
    assert "range(start: start_time, stop: stop_time)" in flux
    assert "r._measurement == influx_measurement" in flux
    assert "r.probe_id == probe_id" in flux
    assert "r.measurement_id == measurement_id" in flux
    assert 'pivot(rowKey: ["_time"], columnKey: ["_field"]' in flux
    assert "group(" not in flux  # Preserve each distinct set of series tags.
    assert 'bucket-with-"quotes' not in flux
    assert captured["query"]["org"] == "test-org"
    assert captured["closed"] is True


def test_query_returns_plain_records_ordered_across_destination_series(monkeypatch):
    fake_client(monkeypatch, [
        make_table({"_time": START + timedelta(hours=2)}),
        make_table({"destination_address": "193.0.14.130"},
                   {"_time": START + timedelta(hours=1)}),
        make_table({"destination_address": "193.0.14.131"}),
    ])
    results = query()
    assert len(results) == 4
    assert [row["timestamp"] for row in results] == [
        "2026-08-26T00:00:00Z", "2026-08-26T00:00:00Z",
        "2026-08-26T01:00:00Z", "2026-08-26T02:00:00Z",
    ]
    assert results[0] == {
        "timestamp": "2026-08-26T00:00:00Z",
        "probe_id": 1017210, "measurement_id": 1001,
        "measurement_type": "ping", "address_family": 4,
        "target_name": "K-root", "measurement_category": "built-in",
        "protocol": "ICMP", "destination_name": "k.root-servers.net",
        "destination_address": "193.0.14.130",
        "packets_sent": 3, "packets_received": 3, "duplicate_packets": 0,
        "packet_loss_percent": 0.0,
        "rtt_min_ms": 18.0, "rtt_avg_ms": 19.0, "rtt_max_ms": 20.0,
    }
    assert results[1]["destination_address"] == "193.0.14.131"
    json.dumps(results)  # No Flux objects or datetimes escape the function.


def test_query_keeps_missing_metrics_and_metadata_as_none(monkeypatch):
    table = make_table({"packets_sent": 0, "packets_received": 0})
    for name in ("rtt_min_ms", "rtt_avg_ms", "rtt_max_ms",
                 "packet_loss_percent", "address_family", "destination_name"):
        table.records[0].values.pop(name)
    fake_client(monkeypatch, [table])
    result = query()[0]
    assert result["packets_received"] == 0
    for name in ("rtt_min_ms", "rtt_avg_ms", "rtt_max_ms",
                 "packet_loss_percent", "address_family", "destination_name"):
        assert result[name] is None


@pytest.mark.parametrize("name", ["probe_id", "measurement_id"])
@pytest.mark.parametrize("value", [0, -1, True, 1.5, "1001", None])
def test_query_rejects_invalid_ids_before_contacting_client(monkeypatch, name, value):
    captured = fake_client(monkeypatch)
    with pytest.raises(ValueError, match=f"{name} must be a positive integer"):
        query(**{name: value})
    assert captured == {}


@pytest.mark.parametrize("overrides", [
    {"start_time": START.replace(tzinfo=None)},
    {"stop_time": STOP.replace(tzinfo=None)},
    {"start_time": "2026-08-26"},
    {"stop_time": None},
    {"stop_time": START},
    {"start_time": STOP, "stop_time": START},
])
def test_query_rejects_invalid_period_before_contacting_client(monkeypatch, overrides):
    captured = fake_client(monkeypatch)
    with pytest.raises(ValueError):
        query(**overrides)
    assert captured == {}


def test_query_reports_safe_context_for_client_errors(monkeypatch):
    captured = fake_client(monkeypatch, error=RuntimeError("secret-test-token"))
    with pytest.raises(RuntimeError, match="probe 1017210, measurement 1001") as info:
        query()
    assert "secret-test-token" not in "".join(traceback.format_exception(info.value))
    assert "2026-08-26" in str(info.value)
    assert captured["closed"] is True

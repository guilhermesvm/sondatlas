from datetime import datetime, timezone

from ripe_atlas_tcc import influxdb_storage


def make_normalized_result():
    return {
        "measurement_id": 1001,
        "probe_id": 1017210,
        "timestamp": datetime(2026, 10, 1, 0, 32, 42, tzinfo=timezone.utc),
        "measurement_type": "ping",
        "address_family": 4,
        "destination_address": "193.0.14.129",
        "destination_name": "k.root-servers.net",
        "protocol": "ICMP",
        "packets_sent": 3,
        "packets_received": 3,
        "duplicate_packets": 0,
        "packet_loss_percent": 0.0,
        "rtt_min_ms": 18.81,
        "rtt_avg_ms": 19.86,
        "rtt_max_ms": 21.12,
    }


def test_build_ping_point_maps_tags_fields_and_timestamp():
    normalized_result = make_normalized_result()

    point = influxdb_storage.build_ping_point(normalized_result)

    assert point == {
        "measurement": "ripe_atlas_ping",
        "tags": {
            "measurement_id": "1001",
            "probe_id": "1017210",
            "address_family": "4",
            "protocol": "ICMP",
            "destination_address": "193.0.14.129",
            "destination_name": "k.root-servers.net",
        },
        "fields": {
            "packets_sent": 3,
            "packets_received": 3,
            "duplicate_packets": 0,
            "packet_loss_percent": 0.0,
            "rtt_min_ms": 18.81,
            "rtt_avg_ms": 19.86,
            "rtt_max_ms": 21.12,
        },
        "time": normalized_result["timestamp"],
    }


def test_build_ping_point_omits_unavailable_values():
    normalized_result = make_normalized_result()
    normalized_result.update(
        {
            "address_family": None,
            "destination_name": None,
            "packet_loss_percent": None,
            "rtt_min_ms": None,
            "rtt_avg_ms": None,
            "rtt_max_ms": None,
        }
    )

    point = influxdb_storage.build_ping_point(normalized_result)

    assert "address_family" not in point["tags"]
    assert "destination_name" not in point["tags"]
    assert "packet_loss_percent" not in point["fields"]
    assert "rtt_min_ms" not in point["fields"]
    assert "rtt_avg_ms" not in point["fields"]
    assert "rtt_max_ms" not in point["fields"]


def test_write_ping_results_sends_points_synchronously(monkeypatch):
    captured = {}

    class FakeWriteApi:
        def write(self, bucket, org, record):
            captured["write"] = {
                "bucket": bucket,
                "org": org,
                "record": record,
            }

    class FakeClient:
        def __init__(self, url, token, org):
            captured["client"] = {
                "url": url,
                "token": token,
                "org": org,
            }

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_value, traceback):
            captured["client_closed"] = True

        def write_api(self, write_options):
            captured["write_options"] = write_options
            return FakeWriteApi()

    monkeypatch.setattr(influxdb_storage, "InfluxDBClient", FakeClient)
    results = [make_normalized_result()]

    written_points = influxdb_storage.write_ping_results(
        results=results,
        url="http://localhost:8086",
        token="test-token",
        org="network-measurement-platform",
        bucket="network-measurement-platform",
    )

    assert written_points == 1
    assert captured["client"] == {
        "url": "http://localhost:8086",
        "token": "test-token",
        "org": "network-measurement-platform",
    }
    assert captured["write"] == {
        "bucket": "network-measurement-platform",
        "org": "network-measurement-platform",
        "record": [influxdb_storage.build_ping_point(results[0])],
    }
    assert captured["write_options"] is influxdb_storage.SYNCHRONOUS
    assert captured["client_closed"] is True

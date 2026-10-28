from datetime import datetime, timezone

import pytest

from sondatlas.pipeline.normalization import normalize_ping_result


def test_normalize_ping_result_with_all_packets_received():
    raw_result = {
        "msm_id": 1001,
        "prb_id": 1017210,
        "timestamp": 1790814762,
        "type": "ping",
        "af": 4,
        "dst_addr": "193.0.14.129",
        "dst_name": "193.0.14.129",
        "proto": "ICMP",
        "sent": 3,
        "rcvd": 3,
        "dup": 0,
        "min": 18.813476,
        "avg": 19.855646333333336,
        "max": 21.117047,
    }

    normalized = normalize_ping_result(
        raw_result,
        target_name="K-root",
        measurement_category="built-in",
    )

    assert normalized == {
        "measurement_id": 1001,
        "probe_id": 1017210,
        "timestamp": datetime(
            2026,
            10,
            1,
            0,
            32,
            42,
            tzinfo=timezone.utc,
        ),
        "measurement_type": "ping",
        "target_name": "K-root",
        "measurement_category": "built-in",
        "address_family": 4,
        "destination_address": "193.0.14.129",
        "destination_name": "193.0.14.129",
        "protocol": "ICMP",
        "packets_sent": 3,
        "packets_received": 3,
        "duplicate_packets": 0,
        "packet_loss_percent": 0.0,
        "rtt_min_ms": 18.813476,
        "rtt_avg_ms": 19.855646333333336,
        "rtt_max_ms": 21.117047,
    }


def test_normalize_ping_result_with_partial_packet_loss():
    raw_result = {
        "msm_id": 1001,
        "prb_id": 1017210,
        "timestamp": 1790814762,
        "sent": 3,
        "rcvd": 2,
        "min": 18.8,
        "avg": 20.0,
        "max": 21.2,
    }

    normalized = normalize_ping_result(raw_result)

    assert normalized["packet_loss_percent"] == pytest.approx(100 / 3)
    assert normalized["rtt_avg_ms"] == 20.0


def test_normalize_ping_result_with_total_packet_loss():
    raw_result = {
        "msm_id": 1001,
        "prb_id": 1017210,
        "timestamp": 1790814762,
        "sent": 3,
        "rcvd": 0,
        "min": -1,
        "avg": -1,
        "max": -1,
    }

    normalized = normalize_ping_result(raw_result)

    assert normalized["packet_loss_percent"] == 100.0
    assert normalized["rtt_min_ms"] is None
    assert normalized["rtt_avg_ms"] is None
    assert normalized["rtt_max_ms"] is None


def test_normalize_ping_result_without_sent_packets():
    raw_result = {
        "msm_id": 1001,
        "prb_id": 1017210,
        "timestamp": 1790814762,
        "sent": 0,
        "rcvd": 0,
        "min": -1,
        "avg": -1,
        "max": -1,
    }

    normalized = normalize_ping_result(raw_result)

    assert normalized["packet_loss_percent"] is None
    assert normalized["rtt_min_ms"] is None
    assert normalized["rtt_avg_ms"] is None
    assert normalized["rtt_max_ms"] is None


def test_normalize_ping_result_converts_valid_integer_rtts_to_float():
    raw_result = {
        "msm_id": 1001,
        "prb_id": 1017210,
        "timestamp": 1790814762,
        "sent": 3,
        "rcvd": 3,
        "min": 18,
        "avg": 20,
        "max": 22,
    }

    normalized = normalize_ping_result(raw_result)

    assert normalized["rtt_min_ms"] == 18.0
    assert normalized["rtt_avg_ms"] == 20.0
    assert normalized["rtt_max_ms"] == 22.0
    assert isinstance(normalized["rtt_min_ms"], float)
    assert isinstance(normalized["rtt_avg_ms"], float)
    assert isinstance(normalized["rtt_max_ms"], float)

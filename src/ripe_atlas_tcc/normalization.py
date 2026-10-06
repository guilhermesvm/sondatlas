from datetime import datetime, timezone


def normalize_rtt(value):
    if value is None or value < 0:
        return None

    return float(value)


def normalize_ping_result(
    result,
    target_name=None,
    measurement_category=None,
):
    packets_sent = result["sent"]
    packets_received = result["rcvd"]

    if packets_sent > 0:
        packet_loss_percent = (
            (packets_sent - packets_received) / packets_sent
        ) * 100
    else:
        packet_loss_percent = None

    return {
        "measurement_id": result["msm_id"],
        "probe_id": result["prb_id"],
        "timestamp": datetime.fromtimestamp(
            result["timestamp"],
            tz=timezone.utc,
        ),
        "measurement_type": result.get("type"),
        "target_name": target_name,
        "measurement_category": measurement_category,
        "address_family": result.get("af"),
        "destination_address": result.get("dst_addr"),
        "destination_name": result.get("dst_name"),
        "protocol": result.get("proto"),
        "packets_sent": packets_sent,
        "packets_received": packets_received,
        "duplicate_packets": result.get("dup", 0),
        "packet_loss_percent": packet_loss_percent,
        "rtt_min_ms": normalize_rtt(result.get("min")),
        "rtt_avg_ms": normalize_rtt(result.get("avg")),
        "rtt_max_ms": normalize_rtt(result.get("max")),
    }

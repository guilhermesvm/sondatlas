from influxdb_client import InfluxDBClient
from influxdb_client.client.write_api import SYNCHRONOUS

INFLUXDB_MEASUREMENT = "ripe_atlas_ping"


def check_influxdb_connection(url, token, org, bucket):
    with InfluxDBClient(url=url, token=token, org=org) as client:
        health = client.health()
        if health.status != "pass":
            raise RuntimeError(
                f"InfluxDB health check returned: {health.status}"
            )

        bucket_info = client.buckets_api().find_bucket_by_name(bucket)
        if bucket_info is None:
            raise RuntimeError(f"InfluxDB bucket not found: {bucket}")

    return {
        "status": health.status,
        "bucket": bucket_info.name,
    }


def build_ping_point(result):
    tags = {
        "measurement_id": str(result["measurement_id"]),
        "probe_id": str(result["probe_id"]),
        "address_family": (
            str(result["address_family"])
            if result["address_family"] is not None
            else None
        ),
        "protocol": result["protocol"],
        "destination_address": result["destination_address"],
        "destination_name": result["destination_name"],
    }
    fields = {
        "packets_sent": result["packets_sent"],
        "packets_received": result["packets_received"],
        "duplicate_packets": result["duplicate_packets"],
        "packet_loss_percent": result["packet_loss_percent"],
        "rtt_min_ms": result["rtt_min_ms"],
        "rtt_avg_ms": result["rtt_avg_ms"],
        "rtt_max_ms": result["rtt_max_ms"],
    }

    return {
        "measurement": INFLUXDB_MEASUREMENT,
        "tags": {
            key: value for key, value in tags.items() if value is not None
        },
        "fields": {
            key: value for key, value in fields.items() if value is not None
        },
        "time": result["timestamp"],
    }


def write_ping_results(results, url, token, org, bucket):
    if not results:
        return 0

    points = [build_ping_point(result) for result in results]

    with InfluxDBClient(url=url, token=token, org=org) as client:
        write_api = client.write_api(write_options=SYNCHRONOUS)
        write_api.write(
            bucket=bucket,
            org=org,
            record=points,
        )

    return len(points)

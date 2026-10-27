from datetime import datetime, timezone

from influxdb_client import InfluxDBClient

from ripe_atlas_tcc.shared.settings import INFLUXDB_MEASUREMENT


PING_HISTORY_QUERY = """
from(bucket: bucket)
    |> range(start: start_time, stop: stop_time)
    |> filter(fn: (r) => r._measurement == influx_measurement)
    |> filter(fn: (r) => r.probe_id == probe_id)
    |> filter(fn: (r) => r.measurement_id == measurement_id)
    |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
"""

PING_TAGS = (
    "target_name",
    "measurement_category",
    "protocol",
    "destination_address",
    "destination_name",
)
PING_FIELDS = (
    "packets_sent",
    "packets_received",
    "duplicate_packets",
    "packet_loss_percent",
    "rtt_min_ms",
    "rtt_avg_ms",
    "rtt_max_ms",
)


def query_ping_results(
    probe_id, measurement_id, start_time, stop_time, *, url, token, org, bucket
):
    """Read individual pings in [start_time, stop_time), ordered by UTC time.

    IDs must be positive integers and both bounds timezone-aware datetimes.
    Returns plain dictionaries with ISO 8601 UTC timestamps and None for
    unavailable fields. Series tags, including changing destination IPs, are
    preserved by pivoting before combining the returned tables.
    """
    for name, value in (
        ("probe_id", probe_id), ("measurement_id", measurement_id)
    ):
        if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
            raise ValueError(f"{name} must be a positive integer")

    for name, value in (("start_time", start_time), ("stop_time", stop_time)):
        if not isinstance(value, datetime) or value.utcoffset() is None:
            raise ValueError(f"{name} must be a timezone-aware datetime")

    start_time = start_time.astimezone(timezone.utc)
    stop_time = stop_time.astimezone(timezone.utc)
    if start_time >= stop_time:
        raise ValueError("start_time must be before stop_time")

    params = {
        "bucket": bucket,
        "influx_measurement": INFLUXDB_MEASUREMENT,
        "probe_id": str(probe_id),
        "measurement_id": str(measurement_id),
        "start_time": start_time,
        "stop_time": stop_time,
    }
    try:
        with InfluxDBClient(url=url, token=token, org=org) as client:
            tables = client.query_api().query(
                query=PING_HISTORY_QUERY, org=org, params=params
            )
    except Exception as error:
        # Client exceptions may contain headers or credentials. Report only
        # safe query context and the error type, without the original message.
        raise RuntimeError(
            f"InfluxDB ping query failed for probe {probe_id}, "
            f"measurement {measurement_id}, "
            f"[{start_time.isoformat()}, {stop_time.isoformat()}) "
            f"({type(error).__name__})"
        ) from None

    records = [record for table in tables for record in table.records]
    records.sort(key=lambda record: record.get_time())
    results = []
    for record in records:
        values = record.values
        address_family = values.get("address_family")
        timestamp = record.get_time().astimezone(timezone.utc)
        results.append({
            "timestamp": timestamp.isoformat().replace("+00:00", "Z"),
            "probe_id": int(values["probe_id"]),
            "measurement_id": int(values["measurement_id"]),
            "measurement_type": "ping",
            "address_family": (
                int(address_family) if address_family is not None else None
            ),
            **{key: values.get(key) for key in PING_TAGS},
            **{key: values.get(key) for key in PING_FIELDS},
        })
    return results

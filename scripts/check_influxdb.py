import sys

from ripe_atlas_tcc.pipeline.influxdb_storage import check_influxdb_connection
from ripe_atlas_tcc.shared.settings import load_influxdb_config


def main():
    try:
        config = load_influxdb_config()
        result = check_influxdb_connection(**config)
    except Exception as error:
        print(f"InfluxDB connection failed: {error}", file=sys.stderr)
        return 1

    print(f"InfluxDB status: {result['status']}")
    print(f"Accessible bucket: {result['bucket']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

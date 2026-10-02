import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

from influxdb_storage import write_ping_results

PROBE_ID = 1017210
MEASUREMENT_ID = 1001


def load_influxdb_config():
    load_dotenv()

    variable_names = (
        "INFLUXDB_URL",
        "INFLUXDB_ORG",
        "INFLUXDB_BUCKET",
        "INFLUXDB_TOKEN",
    )
    missing_variables = [
        name for name in variable_names if not os.getenv(name)
    ]

    if missing_variables:
        missing_labels = ", ".join(missing_variables)
        raise RuntimeError(
            f"Missing required environment variables: {missing_labels}"
        )

    return {
        "url": os.environ["INFLUXDB_URL"],
        "org": os.environ["INFLUXDB_ORG"],
        "bucket": os.environ["INFLUXDB_BUCKET"],
        "token": os.environ["INFLUXDB_TOKEN"],
    }


def fetch_results(measurement_id, probe_id, start_time, stop_time):
    api_url = (
        f"https://atlas.ripe.net/api/v2/"
        f"measurements/{measurement_id}/results/"
    )

    params = {
        "probe_ids": probe_id,
        "start": int(start_time.timestamp()),
        "stop": int(stop_time.timestamp()),
    }

    response = requests.get(
        api_url,
        params=params,
        timeout=30,
    )

    response.raise_for_status()

    return response.json(), response.url


def save_raw_results(
    results,
    measurement_id,
    probe_id,
    start_time,
    stop_time,
    output_directory,
):
    output_directory.mkdir(parents=True, exist_ok=True)

    start_label = start_time.strftime("%Y-%m-%d_%H-%M-%S_UTC")
    stop_label = stop_time.strftime("%Y-%m-%d_%H-%M-%S_UTC")

    filename = (
        f"measurement-{measurement_id}"
        f"_probe-{probe_id}"
        f"_{start_label}"
        f"--{stop_label}.json"
    )

    output_path = output_directory / filename

    with output_path.open("w", encoding="utf-8") as file:
        json.dump(
            results,
            file,
            ensure_ascii=False,
            indent=2,
        )

    return output_path


def save_normalized_results(
    results,
    measurement_id,
    probe_id,
    start_time,
    stop_time,
    output_directory,
):
    output_directory.mkdir(parents=True, exist_ok=True)

    start_label = start_time.strftime("%Y-%m-%d_%H-%M-%S_UTC")
    stop_label = stop_time.strftime("%Y-%m-%d_%H-%M-%S_UTC")

    filename = (
        f"measurement-{measurement_id}"
        f"_probe-{probe_id}"
        f"_{start_label}"
        f"--{stop_label}.json"
    )

    output_path = output_directory / filename
    serializable_results = []

    for result in results:
        serializable_result = result.copy()
        serializable_result["timestamp"] = result["timestamp"].isoformat()
        serializable_results.append(serializable_result)

    with output_path.open("w", encoding="utf-8") as file:
        json.dump(
            serializable_results,
            file,
            ensure_ascii=False,
            indent=2,
        )

    return output_path


def normalize_ping_result(result):
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
        "address_family": result.get("af"),
        "destination_address": result.get("dst_addr"),
        "destination_name": result.get("dst_name"),
        "protocol": result.get("proto"),
        "packets_sent": packets_sent,
        "packets_received": packets_received,
        "duplicate_packets": result.get("dup", 0),
        "packet_loss_percent": packet_loss_percent,
        "rtt_min_ms": result.get("min"),
        "rtt_avg_ms": result.get("avg"),
        "rtt_max_ms": result.get("max"),
    }


def main():
    stop_time = datetime.now(timezone.utc)
    start_time = stop_time - timedelta(minutes=15)

    results, request_url = fetch_results(
        measurement_id=MEASUREMENT_ID,
        probe_id=PROBE_ID,
        start_time=start_time,
        stop_time=stop_time,
    )

    output_path = save_raw_results(
        results=results,
        measurement_id=MEASUREMENT_ID,
        probe_id=PROBE_ID,
        start_time=start_time,
        stop_time=stop_time,
        output_directory=Path("data/raw"),
    )

    normalized_results = [
        normalize_ping_result(result) for result in results
    ]

    normalized_output_path = save_normalized_results(
        results=normalized_results,
        measurement_id=MEASUREMENT_ID,
        probe_id=PROBE_ID,
        start_time=start_time,
        stop_time=stop_time,
        output_directory=Path("data/normalized"),
    )

    influxdb_config = load_influxdb_config()
    written_points = write_ping_results(
        results=normalized_results,
        **influxdb_config,
    )

    print(f"URL consultada: {request_url}")
    print(f"Resultados encontrados: {len(results)}")
    print(f"JSON bruto salvo em: {output_path}")
    print(f"JSON normalizado salvo em: {normalized_output_path}")
    print(f"Pontos enviados ao InfluxDB: {written_points}")

    for index, result in enumerate(normalized_results, start=1):
        packet_loss_percent = result["packet_loss_percent"]
        if packet_loss_percent is None:
            packet_loss_label = "indisponível"
        else:
            packet_loss_label = f"{packet_loss_percent:.2f}%"

        print()
        print(f"Resultado {index}/{len(normalized_results)}")
        print(f"  Horário UTC : {result['timestamp'].isoformat()}")
        print(f"  Probe       : {result['probe_id']}")
        print(f"  Measurement : {result['measurement_id']}")
        print(
            f"  Pacotes     : {result['packets_sent']} enviados | "
            f"{result['packets_received']} recebidos | "
            f"{packet_loss_label} de perda"
        )

        if result["rtt_avg_ms"] is not None:
            print(
                f"  RTT (ms)    : mínimo {result['rtt_min_ms']:.2f} | "
                f"médio {result['rtt_avg_ms']:.2f} | "
                f"máximo {result['rtt_max_ms']:.2f}"
            )
        else:
            print("  RTT (ms)    : indisponível — nenhuma resposta recebida")

        print("-" * 60)


if __name__ == "__main__":
    main()

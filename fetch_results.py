import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

PROBE_ID = 1017210
MEASUREMENT_ID = 1001


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


stop_time = datetime.now(timezone.utc)
start_time = stop_time - timedelta(minutes=15)

results, request_url = fetch_results(
    measurement_id=MEASUREMENT_ID,
    probe_id=PROBE_ID,
    start_time=start_time,
    stop_time=stop_time,
)

output_directory = Path("data/raw")
output_directory.mkdir(parents=True, exist_ok=True)

start_label = start_time.strftime("%Y-%m-%d_%H-%M-%S_UTC")
stop_label = stop_time.strftime("%Y-%m-%d_%H-%M-%S_UTC")

filename = (
    f"measurement-{MEASUREMENT_ID}"
    f"_probe-{PROBE_ID}"
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

print(f"URL consultada: {request_url}")
print(f"Resultados encontrados: {len(results)}")
print(f"JSON bruto salvo em: {output_path}")

for index, result in enumerate(results, start=1):
    timestamp = datetime.fromtimestamp(
        result["timestamp"],
        tz=timezone.utc,
    )

    print()
    print(f"Resultado {index}/{len(results)}")
    print(f"  Horário UTC : {timestamp.isoformat()}")
    print(f"  Probe       : {result['prb_id']}")
    print(f"  Measurement : {result['msm_id']}")
    print(
        f"  Pacotes     : {result.get('sent')} enviados | "
        f"{result.get('rcvd')} recebidos"
    )

    if result.get("rcvd", 0) > 0:
        print(
            f"  RTT (ms)    : mínimo {result['min']:.2f} | "
            f"médio {result['avg']:.2f} | "
            f"máximo {result['max']:.2f}"
        )
    else:
        print("  RTT (ms)    : indisponível — nenhuma resposta recebida")

    print("-" * 60)

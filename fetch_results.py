from datetime import datetime, timedelta, timezone

import requests

PROBE_ID = 1017210
MEASUREMENT_ID = 1001

API_URL = (
    f"https://atlas.ripe.net/api/v2/"
    f"measurements/{MEASUREMENT_ID}/results/"
)

stop_time = datetime.now(timezone.utc)
start_time = stop_time - timedelta(minutes=15)

params = {
    "probe_ids": PROBE_ID,
    "start": int(start_time.timestamp()),
    "stop": int(stop_time.timestamp()),
}

response = requests.get(
    API_URL,
    params=params,
    timeout=30,
)

response.raise_for_status()

results = response.json()

print(f"URL consultada: {response.url}")
print(f"Resultados encontrados: {len(results)}")

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

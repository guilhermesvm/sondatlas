from datetime import timezone


def format_utc_timestamp(value):
    return (
        value.astimezone(timezone.utc)
        .isoformat()
        .replace("+00:00", "Z")
    )


def print_run_summary(
    target_name,
    measurement_category,
    request_url,
    results_count,
    raw_output_path,
    normalized_output_path,
    written_points,
):
    print(f"Alvo lógico: {target_name} ({measurement_category})")
    print(f"URL consultada: {request_url}")
    print(f"Resultados encontrados: {results_count}")
    print(f"JSON bruto salvo em: {raw_output_path}")
    print(f"JSON normalizado salvo em: {normalized_output_path}")
    print(f"Pontos enviados ao InfluxDB: {written_points}")


def print_no_collection_interval(
    available_at,
    measurement_id,
    target_name,
):
    print("Ainda não há um novo intervalo mínimo para coleta.")
    print(
        f"Measurement {measurement_id} ({target_name}): "
        "a próxima janela poderá ser consultada a partir de: "
        f"{available_at.isoformat()} (UTC)"
    )
    print("-" * 60)


def print_probe_selected(probe_id, status_name):
    print(f"Probe {probe_id} selecionada ({status_name}).\n")


def print_polling_stopped():
    print("Polling encerrado pelo usuário.")


def print_polling_started(interval_seconds):
    print(
        "Polling iniciado. "
        f"Verificando novas janelas a cada {interval_seconds} segundo(s).\n"
    )


def print_backfill_started(start_time, stop_time):
    print(
        "Backfill all-time iniciado: "
        f"{format_utc_timestamp(start_time)} → "
        f"{format_utc_timestamp(stop_time)}"
    )


def print_backfill_block(
    target_name,
    block_number,
    total_blocks,
    start_time,
    stop_time,
    results_count,
    written_points,
):
    start_label = start_time.astimezone(timezone.utc).date().isoformat()
    stop_label = stop_time.astimezone(timezone.utc).date().isoformat()
    print(
        f"[{target_name}] Bloco {block_number}/{total_blocks} | "
        f"{start_label} → {stop_label} | "
        f"{results_count} resultados | {written_points} pontos"
    )


def print_backfill_completed(stop_time):
    print(
        "Backfill all-time concluído. "
        "Checkpoints promovidos para "
        f"{format_utc_timestamp(stop_time)}"
    )


def print_ping_results(results):
    for index, result in enumerate(results, start=1):
        packet_loss_percent = result["packet_loss_percent"]
        if packet_loss_percent is None:
            packet_loss_label = "indisponível"
        else:
            packet_loss_label = f"{packet_loss_percent:.2f}%"

        print()
        print(f"Resultado {index}/{len(results)}")
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

def print_run_summary(
    request_url,
    results_count,
    raw_output_path,
    normalized_output_path,
    written_points,
):
    print(f"URL consultada: {request_url}")
    print(f"Resultados encontrados: {results_count}")
    print(f"JSON bruto salvo em: {raw_output_path}")
    print(f"JSON normalizado salvo em: {normalized_output_path}")
    print(f"Pontos enviados ao InfluxDB: {written_points}")


def print_no_collection_interval(available_at):
    print("Ainda não há um novo intervalo mínimo para coleta.")
    print(f"Próxima coleta disponível a partir de: {available_at.isoformat()}")


def print_polling_stopped():
    print("Polling encerrado pelo usuário.")


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

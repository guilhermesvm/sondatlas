from datetime import datetime, timezone

from sondatlas.pipeline.console_output import (
    print_backfill_block,
    print_backfill_completed,
    print_backfill_started,
)


def test_backfill_output_is_compact(capsys):
    start_time = datetime(2026, 8, 26, 2, 3, 41, tzinfo=timezone.utc)
    block_stop = datetime(2026, 8, 27, 2, 3, 41, tzinfo=timezone.utc)
    stop_time = datetime(2026, 10, 10, 19, 13, 27, tzinfo=timezone.utc)

    print_backfill_started(start_time, stop_time)
    print_backfill_block(
        target_name="K-root",
        block_number=1,
        total_blocks=46,
        start_time=start_time,
        stop_time=block_stop,
        results_count=93,
        written_points=93,
    )
    print_backfill_completed(stop_time)

    assert capsys.readouterr().out.splitlines() == [
        "Backfill all-time iniciado: "
        "2026-08-26T02:03:41Z → 2026-10-10T19:13:27Z",
        "[K-root] Bloco 1/46 | 2026-08-26 → 2026-08-27 | "
        "93 resultados | 93 pontos",
        "Backfill all-time concluído. Checkpoints promovidos para "
        "2026-10-10T19:13:27Z",
    ]

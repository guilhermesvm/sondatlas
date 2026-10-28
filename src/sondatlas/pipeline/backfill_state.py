import json
from datetime import timezone

STATE_VERSION = 1


def backfill_state_path(state_directory, probe_id):
    return state_directory / f"probe-{probe_id}.json"


def migrate_legacy_backfill_state(legacy_path, state_directory):
    if not legacy_path.exists():
        return

    state = load_backfill_state(legacy_path)
    target_path = backfill_state_path(state_directory, state["probe_id"])
    if target_path.exists():
        return

    target_path.parent.mkdir(parents=True, exist_ok=True)
    legacy_path.replace(target_path)


def save_backfill_state(state_path, state):
    state_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = state_path.with_name(f".{state_path.name}.tmp")
    temporary_path.write_text(
        json.dumps(state, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    temporary_path.replace(state_path)


def load_backfill_state(state_path):
    if not state_path.exists():
        return None

    state = json.loads(state_path.read_text(encoding="utf-8"))
    if state.get("version") != STATE_VERSION:
        raise ValueError("Unsupported backfill state version")

    return state


def create_backfill_state(
    state_path,
    probe_id,
    bucket,
    start_time,
    stop_time,
    measurement_ids,
):
    start_label = start_time.astimezone(timezone.utc).isoformat()
    state = {
        "version": STATE_VERSION,
        "status": "in_progress",
        "probe_id": probe_id,
        "bucket": bucket,
        "start_time": start_label,
        "stop_time": stop_time.astimezone(timezone.utc).isoformat(),
        "measurements": {
            str(measurement_id): {"next_start": start_label}
            for measurement_id in measurement_ids
        },
    }
    save_backfill_state(state_path, state)
    return state


def save_backfill_progress(
    state_path,
    state,
    measurement_id,
    next_start,
):
    state["measurements"][str(measurement_id)]["next_start"] = (
        next_start.astimezone(timezone.utc).isoformat()
    )
    save_backfill_state(state_path, state)


def mark_backfill_complete(state_path, state):
    state["status"] = "complete"
    save_backfill_state(state_path, state)

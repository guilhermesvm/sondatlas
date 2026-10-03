import json
from datetime import datetime, timedelta, timezone

STATE_VERSION = 1


def checkpoint_key(measurement_id, probe_id):
    return f"measurement-{measurement_id}_probe-{probe_id}"


def load_last_successful_stop(state_path, measurement_id, probe_id):
    if not state_path.exists():
        return None

    state = json.loads(state_path.read_text(encoding="utf-8"))
    if state.get("version") != STATE_VERSION:
        raise ValueError("Unsupported collection state version")

    checkpoint = state.get("checkpoints", {}).get(
        checkpoint_key(measurement_id, probe_id)
    )
    if checkpoint is None:
        return None

    return datetime.fromisoformat(checkpoint["last_successful_stop"])


def calculate_collection_window(
    current_time,
    last_successful_stop,
    initial_lookback_minutes,
    minimum_interval_minutes,
    collection_delay_minutes,
):
    current_time = current_time.astimezone(timezone.utc).replace(microsecond=0)
    safe_stop_time = current_time - timedelta(
        minutes=collection_delay_minutes
    )
    if last_successful_stop is None:
        initial_lookback = timedelta(minutes=initial_lookback_minutes)
        return safe_stop_time - initial_lookback, safe_stop_time

    start_time = last_successful_stop.astimezone(timezone.utc)
    minimum_interval = timedelta(minutes=minimum_interval_minutes)

    if safe_stop_time - start_time < minimum_interval:
        return None

    return start_time, safe_stop_time


def save_last_successful_stop(
    state_path,
    measurement_id,
    probe_id,
    stop_time,
):
    if state_path.exists():
        state = json.loads(state_path.read_text(encoding="utf-8"))
        if state.get("version") != STATE_VERSION:
            raise ValueError("Unsupported collection state version")
    else:
        state = {"version": STATE_VERSION, "checkpoints": {}}

    state.setdefault("checkpoints", {})[
        checkpoint_key(measurement_id, probe_id)
    ] = {
        "last_successful_stop": stop_time.astimezone(timezone.utc).isoformat()
    }

    state_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = state_path.with_name(f".{state_path.name}.tmp")
    temporary_path.write_text(
        json.dumps(state, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    temporary_path.replace(state_path)

import json

STATE_VERSION = 1


def load_selected_probe(state_path):
    if not state_path.exists():
        return None

    state = json.loads(state_path.read_text(encoding="utf-8"))
    if state.get("version") != STATE_VERSION:
        raise ValueError("Unsupported probe state version")

    return state["probe_id"]


def save_selected_probe(state_path, probe_id):
    state_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = state_path.with_name(f".{state_path.name}.tmp")
    temporary_path.write_text(
        json.dumps(
            {"version": STATE_VERSION, "probe_id": probe_id},
            indent=2,
        ),
        encoding="utf-8",
    )
    temporary_path.replace(state_path)


def clear_selected_probe(state_path):
    state_path.unlink(missing_ok=True)

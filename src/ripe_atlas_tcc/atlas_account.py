import json
from pathlib import Path

import requests

ACCOUNT_STATE_PATH = Path("data/state/atlas-account.json")
STATE_VERSION = 1
PROBE_FIELDS = ("id", "description", "status", "first_connected", "total_uptime", "is_public")


class KeyRefusedError(Exception):
    pass


def load_key(state_path):
    if not state_path.exists():
        return None

    state = json.loads(state_path.read_text(encoding="utf-8"))
    if state.get("version") != STATE_VERSION:
        raise ValueError("Unsupported account state version")

    return state["key"]


def save_key(state_path, key):
    state_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = state_path.with_name(f".{state_path.name}.tmp")
    temporary_path.write_text(
        json.dumps({"version": STATE_VERSION, "key": key}, indent=2),
        encoding="utf-8",
    )
    temporary_path.replace(state_path)


def delete_key(state_path):
    state_path.unlink(missing_ok=True)


def fetch_my_probes(key):
    """Probes managed by the key owner, without addresses or prefixes."""
    response = requests.get(
        "https://atlas.ripe.net/api/v2/probes/my/",
        headers={"Authorization": f"Key {key}"},
        timeout=30,
    )
    if response.status_code in (401, 403):
        raise KeyRefusedError()
    response.raise_for_status()
    return [
        {field: probe.get(field) for field in PROBE_FIELDS}
        for probe in response.json()["results"]
    ]

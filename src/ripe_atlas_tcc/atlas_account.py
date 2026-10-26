import json
from pathlib import Path

import requests

ACCOUNT_STATE_PATH = Path("data/state/atlas-account.json")
STATE_VERSION = 1
PROBE_FIELDS = ("id", "description", "status", "first_connected", "total_uptime", "is_public", "asn_v4")


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


def fetch_credits(key):
    """Account balance, or None when the key lacks the credits permission."""
    response = requests.get(
        "https://atlas.ripe.net/api/v2/credits/",
        headers={"Authorization": f"Key {key}"},
        timeout=30,
    )
    if response.status_code in (401, 403):
        return None
    response.raise_for_status()
    account = response.json()
    return {
        "current_balance": account["current_balance"],
        "estimated_daily_income": account.get("estimated_daily_income"),
    }


def fetch_account(key):
    """RIPE answers a missing permission like an invalid key, so the key is
    refused only when no permission works; otherwise the missing ones are listed."""
    credits = fetch_credits(key)
    try:
        probes = fetch_my_probes(key)
    except KeyRefusedError:
        if credits is None:
            raise
        probes = None
    return {
        "connected": True,
        "probes": probes,
        "credits": credits,
        "missing_permissions": [
            name for name, value in (("probes", probes), ("credits", credits)) if value is None
        ],
    }

import ipaddress
import json
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

ACCOUNT_STATE_PATH = Path("data/state/atlas-account.json")
STATE_VERSION = 1
PROBE_FIELDS = ("id", "description", "status", "first_connected", "total_uptime", "is_public", "asn_v4")


class KeyRefusedError(Exception):
    pass


class MissingPermissionError(Exception):
    pass


class MeasurementRejectedError(Exception):
    """RIPE Atlas refused the measurement; the message is RIPE's own, safe to show."""


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


def fetch_income(key):
    """Daily estimate and yesterday's result reward of each hosted probe, or None without the credits permission."""
    response = requests.get(
        "https://atlas.ripe.net/api/v2/credits/income-items/",
        headers={"Authorization": f"Key {key}"},
        timeout=30,
    )
    if response.status_code in (401, 403):
        return None
    response.raise_for_status()
    return [
        {
            "probe_id": item["probe_id"],
            "estimated_daily_income": float(item["estimated_daily_income"]),
            "yesterday_results_reward": item.get("yesterday_results_reward"),
        }
        for item in response.json()["groups"].get("hosted_probes", [])
    ]


def can_schedule(key):
    """True when the key may create measurements. An empty request creates nothing:
    RIPE answers 400 (incomplete) to a key that may create and 401 or 403 to one that may not."""
    response = requests.post(
        "https://atlas.ripe.net/api/v2/measurements/",
        headers={"Authorization": f"Key {key}"},
        json={},
        timeout=30,
    )
    if response.status_code in (401, 403):
        return False
    if response.status_code == 400:
        return True
    response.raise_for_status()
    return True


MY_MEASUREMENTS_URL = "https://atlas.ripe.net/api/v2/measurements/my/"


def can_list(key):
    """True when the key may list the measurements of its owner ("List your measurements")."""
    response = requests.get(
        f"{MY_MEASUREMENTS_URL}?page_size=1&fields=id",
        headers={"Authorization": f"Key {key}"},
        timeout=30,
    )
    if response.status_code in (401, 403):
        return False
    response.raise_for_status()
    return True


def fetch_challenges(key, oldest=False, kind=None):
    """The 50 newest (or oldest) measurements the key owner created through Sondatlas (tag sondatlas), with the total.
    kind keeps only one type, such as traceroute."""
    response = requests.get(
        f"{MY_MEASUREMENTS_URL}?tags=sondatlas&sort={'id' if oldest else '-id'}&page_size=50{f'&type={kind}' if kind else ''}"
        "&fields=id,type,target,creation_time,probes&optional_fields=probes",
        headers={"Authorization": f"Key {key}"},
        timeout=30,
    )
    if response.status_code in (401, 403):
        raise MissingPermissionError()
    response.raise_for_status()
    page = response.json()
    return {
        "count": page["count"],
        "challenges": [
            {
                "id": measurement["id"],
                "type": measurement["type"],
                "target": measurement["target"],
                "created": measurement["creation_time"],
                "probe_id": (measurement.get("probes") or [{}])[0].get("id"),
            }
            for measurement in page["results"]
        ],
    }


def fetch_account(key):
    """RIPE answers a missing permission like an invalid key, so the key is
    refused only when no permission works; otherwise the missing ones are listed.
    The five requests do not depend on each other, so they run at the same time."""
    with ThreadPoolExecutor(max_workers=5) as pool:
        credits = pool.submit(fetch_credits, key)
        scheduling = pool.submit(can_schedule, key)
        listing = pool.submit(can_list, key)
        probes = pool.submit(fetch_my_probes, key)
        income = pool.submit(fetch_income, key)
    credits, scheduling, listing, income = credits.result(), scheduling.result(), listing.result(), income.result()
    try:
        probes = probes.result()
    except KeyRefusedError:
        if credits is None and not scheduling and not listing:
            raise
        probes = None
    return {
        "connected": True,
        "probes": probes,
        "credits": credits,
        "income": income if credits is not None else None,
        "missing_permissions": [
            name for name, missing in (("probes", probes is None), ("credits", credits is None), ("measurements", not scheduling), ("my_measurements", not listing)) if missing
        ],
    }


HOSTNAME = re.compile(r"^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")


def valid_target(target):
    """A host name or a public IPv4 address; RIPE Atlas refuses private ones anyway."""
    try:
        return ipaddress.IPv4Address(target).is_global
    except ValueError:
        return bool(HOSTNAME.match(target))


def ripe_message(response):
    try:
        error = response.json().get("error", {})
    except ValueError:
        return "RIPE Atlas refused the measurement"
    details = [error.get("detail")] + [item.get("detail") for item in error.get("errors", []) if isinstance(item, dict)]
    return " ".join(str(detail) for detail in details if detail)[:300] or "RIPE Atlas refused the measurement"


def is_address(target):
    try:
        ipaddress.ip_address(target)
        return True
    except ValueError:
        return False


def create_measurement(key, probe_id, kind, target, packets, description):
    """One-off IPv4 ping or traceroute from one probe, public by RIPE Atlas default and tagged sondatlas,
    so anyone can count the measurements made through Sondatlas. Returns the measurement ID.
    A name is resolved by the probe's own DNS, like a computer on that network would:
    resolved centrally, a service with servers around the world may answer with one far from the probe."""
    definition = {
        "type": kind,
        "af": 4,
        "target": target,
        "packets": packets,
        "description": description,
        "tags": ["sondatlas"],
    }
    if not is_address(target):
        definition["resolve_on_probe"] = True
    response = requests.post(
        "https://atlas.ripe.net/api/v2/measurements/",
        headers={"Authorization": f"Key {key}"},
        json={
            "definitions": [definition],
            "probes": [{"type": "probes", "value": str(probe_id), "requested": 1}],
            "is_oneoff": True,
        },
        timeout=30,
    )
    if response.status_code in (401, 403):
        raise MissingPermissionError()
    if response.status_code == 400:
        raise MeasurementRejectedError(ripe_message(response))
    response.raise_for_status()
    return response.json()["measurements"][0]

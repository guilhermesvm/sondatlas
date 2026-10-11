"""Read and refresh the latest summary of public connected RIPE Atlas probes."""

from contextlib import ExitStack
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from urllib.parse import urlparse

import requests

from ripe_atlas_tcc.execution_lock import execution_lock


PROBES_URL = "https://atlas.ripe.net/api/v2/probes/"
QUERY_URL = PROBES_URL + "?is_public=true&status=1&page_size=500&sort=id"
OUTPUT_DIR = Path(__file__).resolve().parents[2] / "data/probe-distribution"
MAX_COLLECTION_SECONDS = 180


class DistributionBusy(RuntimeError):
    pass


def check_deadline(deadline):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError("Probe distribution collection exceeded its total time budget")
    return remaining


def fetch_snapshot(deadline=None):
    """Collect pages cooperatively; refresh_distribution supervises blocking I/O."""
    started = datetime.now(timezone.utc).isoformat()
    if deadline is None:
        deadline = time.monotonic() + MAX_COLLECTION_SECONDS
    pages = []
    visited = set()
    url = QUERY_URL
    with requests.Session() as session:
        while url:
            parsed = urlparse(url)
            if parsed.scheme != "https" or parsed.netloc != "atlas.ripe.net" or parsed.path != "/api/v2/probes/":
                raise ValueError("Unexpected pagination endpoint")
            if url in visited:
                raise ValueError("Repeated pagination URL")
            visited.add(url)
            response = session.get(url, timeout=min(30, check_deadline(deadline)))
            response.raise_for_status()
            payload = response.json()
            check_deadline(deadline)
            if not isinstance(payload, dict) or not isinstance(payload.get("results"), list) or "next" not in payload or "count" not in payload:
                raise ValueError("Invalid paginated probe response")
            for probe in payload["results"]:
                if probe.get("is_public") is not True or probe.get("status", {}).get("id") != 1:
                    raise ValueError("API returned a probe outside the public connected scope")
            pages.append({"url": url, "retrieved_at_utc": datetime.now(timezone.utc).isoformat(), "response": payload})
            print(f"Página {len(pages)}: {len(payload['results'])} probes recebidas.", flush=True)
            url = payload["next"]
    return {
        "started_at_utc": started,
        "finished_at_utc": datetime.now(timezone.utc).isoformat(),
        "source": QUERY_URL,
        "scope": "public probes with status.id=1 (Connected); anchors included",
        "pages": pages,
    }


def summarize_snapshot(snapshot):
    probes = {}
    received = 0
    for page in snapshot["pages"]:
        for probe in page["response"]["results"]:
            received += 1
            probes.setdefault(probe["id"], probe)
    grouped = {}
    for probe in probes.values():
        country = probe.get("country_code") or "UNKNOWN"
        grouped.setdefault(country, []).append(probe)
    total = len(probes)
    countries = []
    for country, members in grouped.items():
        asns = {p["asn_v4"] for p in members if p.get("asn_v4") is not None}
        countries.append({
            "country_code": country,
            "probes": len(members),
            "share_percent": 100 * len(members) / total,
            "ipv4_asns": len(asns),
            "missing_ipv4_asn": sum(p.get("asn_v4") is None for p in members),
        })
    countries.sort(key=lambda row: (-row["probes"], row["country_code"]))
    return {
        "total_probes": total,
        "country_codes_with_probes": sum(row["country_code"] != "UNKNOWN" for row in countries),
        "duplicate_records": received - total,
        "api_counts_by_page": [page["response"]["count"] for page in snapshot["pages"]],
        "countries": countries,
    }


def dashboard_summary(snapshot, summary, collection_id):
    brazil = next((r for r in summary["countries"] if r["country_code"] == "BR"), {
        "country_code": "BR", "probes": 0,
        "share_percent": 0 if summary["total_probes"] else None,
    })
    selected = summary["countries"][:10]
    if not any(row["country_code"] == "BR" for row in selected):
        selected = [*selected, brazil]
    counts = summary["api_counts_by_page"]
    return {
        "collection_id": collection_id,
        "started_at_utc": snapshot["started_at_utc"],
        "finished_at_utc": snapshot["finished_at_utc"],
        "source": snapshot["source"],
        "scope": "public connected probes; anchors included",
        "total_probes": summary["total_probes"],
        "brazil": {key: brazil[key] for key in ("country_code", "probes", "share_percent")},
        "top_countries": [{key: row[key] for key in ("country_code", "probes", "share_percent")} for row in selected],
        "duplicate_records": summary["duplicate_records"],
        "api_count_min": min(counts) if counts else None,
        "api_count_max": max(counts) if counts else None,
        "count_mismatch": bool(summary["duplicate_records"] or len(set(counts)) > 1 or (counts and counts[0] != summary["total_probes"])),
    }


def read_distribution(output_dir=None):
    root = Path(output_dir) if output_dir is not None else OUTPUT_DIR
    latest = root / "latest.json"
    if not latest.exists():
        return None
    return json.loads(latest.read_text(encoding="utf-8"))


def _collect_summary(temporary, deadline):
    snapshot = fetch_snapshot(deadline)
    summary = summarize_snapshot(snapshot)
    collection_id = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S_%f_UTC")
    result = dashboard_summary(snapshot, summary, collection_id)
    check_deadline(deadline)
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    check_deadline(deadline)


def _run_collection(temporary, deadline):
    process = subprocess.Popen(
        [sys.executable, "-m", "ripe_atlas_tcc.probe_distribution", str(temporary), str(deadline)],
        stdin=subprocess.DEVNULL,
    )
    try:
        try:
            status = process.wait(timeout=check_deadline(deadline))
        except subprocess.TimeoutExpired:
            raise TimeoutError("Probe distribution collection exceeded its total time budget") from None
        if status == 124:
            raise TimeoutError("Probe distribution collection timed out")
        if status != 0:
            raise OSError(f"Probe distribution collector failed with exit code {status}")
    finally:
        if process.poll() is None:
            process.kill()
        process.wait()


def refresh_distribution(output_dir=None):
    root = (Path(output_dir) if output_dir is not None else OUTPUT_DIR).resolve()
    root.mkdir(parents=True, exist_ok=True)
    with ExitStack() as stack:
        try:
            stack.enter_context(execution_lock(root / ".refresh.lock"))
        except RuntimeError as error:
            raise DistributionBusy("Another probe distribution collection is already running") from error
        deadline = time.monotonic() + MAX_COLLECTION_SECONDS
        temporary = root / "latest.tmp"
        try:
            _run_collection(temporary, deadline)
            result = json.loads(temporary.read_text(encoding="utf-8"))
            check_deadline(deadline)
            os.replace(temporary, root / "latest.json")
            return result
        finally:
            temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    try:
        _collect_summary(Path(sys.argv[1]), float(sys.argv[2]))
    except (TimeoutError, requests.Timeout) as error:
        print(f"Probe distribution collection timed out: {error}", file=sys.stderr, flush=True)
        sys.exit(124)

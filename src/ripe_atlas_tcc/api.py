import logging
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Body, FastAPI, HTTPException, Query

import requests

from ripe_atlas_tcc import probe_distribution
from ripe_atlas_tcc.atlas_account import (
    ACCOUNT_STATE_PATH,
    KeyRefusedError,
    delete_key,
    fetch_account,
    load_key,
    save_key,
)
from ripe_atlas_tcc.influxdb_queries import query_ping_results
from ripe_atlas_tcc.probe_state import (
    clear_selected_probe,
    load_selected_probe,
    save_selected_probe,
)
from ripe_atlas_tcc.ripe_atlas_client import fetch_probe
from ripe_atlas_tcc.settings import (
    PING_MEASUREMENTS,
    PROBE_STATE_PATH,
    load_influxdb_config,
)


logger = logging.getLogger(__name__)
MAX_QUERY_DAYS = 60
app = FastAPI(
    title="RIPE Atlas Ping History",
    description="Select the probe, read stored ping results and manually refresh the public probe distribution. Local use only.",
    version="0.1.0",
)


def resolve_probe(probe_id):
    """Return the selected probe; another requested probe is a 404."""
    try:
        selected_probe_id = load_selected_probe(PROBE_STATE_PATH)
    except (OSError, ValueError, KeyError) as error:
        logger.warning("Selected probe unavailable (%s)", type(error).__name__)
        raise HTTPException(
            status_code=503, detail="Selected probe is unavailable"
        ) from None
    if selected_probe_id is None:
        raise HTTPException(status_code=404, detail="No probe selected")
    if probe_id is not None and probe_id != selected_probe_id:
        raise HTTPException(status_code=404, detail="Probe is not configured")
    return selected_probe_id


@app.get(
    "/probe",
    summary="Read the selected probe ID (no external request)",
    description="Returns probe_id: null when no probe has been selected yet.",
    responses={503: {"description": "Saved selection cannot be read"}},
)
def get_probe():
    try:
        return {"probe_id": load_selected_probe(PROBE_STATE_PATH)}
    except (OSError, ValueError, KeyError) as error:
        logger.warning("Selected probe unavailable (%s)", type(error).__name__)
        raise HTTPException(status_code=503, detail="Selected probe is unavailable") from None


@app.put(
    "/probe",
    summary="Check the probe in RIPE Atlas and save it as the selected probe",
    description="Same check and file as fetch_results.py --probe-id. A running --poll picks the new probe up on its next cycle. On any failure the previous selection is kept. is_public tells whether anonymous readers (this project) can see the probe's results.",
    responses={
        404: {"description": "Probe does not exist in RIPE Atlas"},
        503: {"description": "RIPE Atlas unavailable or selection not saved; previous selection is kept"},
    },
)
def put_probe(probe_id: Annotated[int, Body(gt=0, embed=True)]):
    try:
        probe = fetch_probe(probe_id)
    except RuntimeError:
        raise HTTPException(status_code=404, detail="Probe does not exist in RIPE Atlas") from None
    except (requests.RequestException, ValueError) as error:
        logger.warning("RIPE Atlas probe check failed (%s)", type(error).__name__)
        raise HTTPException(status_code=503, detail="RIPE Atlas is unavailable; the selected probe was not changed") from None
    try:
        save_selected_probe(PROBE_STATE_PATH, probe_id)
    except OSError as error:
        logger.warning("Probe selection not saved (%s)", type(error).__name__)
        raise HTTPException(status_code=503, detail="The selected probe could not be saved") from None
    return {"probe_id": probe_id, "is_public": probe.get("is_public")}


@app.delete(
    "/probe",
    summary="Stop following the selected probe",
    description="Removes the saved selection, so a running --poll waits at its next cycle. Stored results and checkpoints are kept; selecting the same probe again resumes from its last checkpoint.",
    responses={503: {"description": "Selection could not be removed"}},
)
def delete_probe():
    try:
        clear_selected_probe(PROBE_STATE_PATH)
    except OSError as error:
        logger.warning("Probe selection not removed (%s)", type(error).__name__)
        raise HTTPException(status_code=503, detail="The selected probe could not be removed") from None
    return {"probe_id": None}


def account_data(key):
    try:
        return fetch_account(key)
    except (requests.RequestException, ValueError, KeyError, TypeError) as error:
        logger.warning("RIPE Atlas account check failed (%s)", type(error).__name__)
        raise HTTPException(status_code=503, detail="RIPE Atlas is unavailable") from None


@app.get(
    "/account",
    summary="Read the probes of the connected RIPE Atlas account",
    description="Returns connected: false when no key is saved. Otherwise lists the probes managed by the key owner (GET /api/v2/probes/my/), with their IPv4 ASN but without addresses or prefixes, plus the credit balance (GET /api/v2/credits/). A saved key missing a permission still answers with what it can: probes or credits is null and missing_permissions says which. It is refused (403) only when no permission works. The key itself is never returned.",
    responses={
        403: {"description": "RIPE Atlas refused the saved key"},
        503: {"description": "Saved key cannot be read or RIPE Atlas unavailable"},
    },
)
def get_account():
    try:
        key = load_key(ACCOUNT_STATE_PATH)
    except (OSError, ValueError, KeyError) as error:
        logger.warning("Saved account unavailable (%s)", type(error).__name__)
        raise HTTPException(status_code=503, detail="Saved account is unavailable") from None
    if key is None:
        return {"connected": False}
    try:
        return account_data(key)
    except KeyRefusedError:
        raise HTTPException(status_code=403, detail="RIPE Atlas refused the saved key") from None


@app.put(
    "/account",
    summary="Check a RIPE Atlas API key and save it locally",
    description="The key is saved in data/state only after RIPE Atlas accepts it with every required permission (probes, credits and creating measurements, checked with an empty request that creates nothing). On any failure the previous key is kept. The response lists the account probes, never the key.",
    responses={
        422: {"description": "Empty key, RIPE Atlas refused it, or detail.missing_permissions lists what it lacks; previous key is kept"},
        503: {"description": "RIPE Atlas unavailable or key not saved; previous key is kept"},
    },
)
def put_account(key: Annotated[str, Body(embed=True, max_length=200)]):
    key = key.strip()
    if not key:
        raise HTTPException(status_code=422, detail="Key is empty")
    try:
        account = account_data(key)
    except KeyRefusedError:
        raise HTTPException(status_code=422, detail="RIPE Atlas refused the key") from None
    if account["missing_permissions"]:
        raise HTTPException(status_code=422, detail={"missing_permissions": account["missing_permissions"]})
    try:
        save_key(ACCOUNT_STATE_PATH, key)
    except OSError as error:
        logger.warning("Account key not saved (%s)", type(error).__name__)
        raise HTTPException(status_code=503, detail="The key could not be saved") from None
    return account


@app.delete(
    "/account",
    summary="Forget the saved RIPE Atlas API key",
    description="Removes the key from data/state. The key stays valid in RIPE Atlas until it is disabled or deleted there.",
    responses={503: {"description": "Key could not be removed"}},
)
def delete_account():
    try:
        delete_key(ACCOUNT_STATE_PATH)
    except OSError as error:
        logger.warning("Account key not removed (%s)", type(error).__name__)
        raise HTTPException(status_code=503, detail="The key could not be removed") from None
    return {"connected": False}


@app.get(
    "/targets",
    summary="List configured ping targets",
    responses={404: {"description": "No probe selected or another probe requested"}},
)
def get_targets(
    probe_id: Annotated[
        int | None, Query(gt=0, description="Defaults to the selected probe")
    ] = None,
):
    probe_id = resolve_probe(probe_id)
    return {
        "probe_id": probe_id,
        "targets": [dict(measurement) for measurement in PING_MEASUREMENTS],
    }


@app.get(
    "/probe-distribution",
    summary="Read the last successful local probe distribution (no external request)",
    description="Returns an object with distribution: null when there is no saved collection, not a zero probe count. Otherwise distribution contains collection_id, UTC start/end times, source/scope, total_probes, Brazil count/share, top_countries, duplicate_records and API count consistency metadata. Raw probe pages are never returned.",
    responses={503: {"description": "Saved collection cannot be read"}},
)
def get_probe_distribution():
    try:
        return {"distribution": probe_distribution.read_distribution()}
    except (OSError, ValueError, KeyError, TypeError) as error:
        logger.warning("Saved probe distribution unavailable (%s)", type(error).__name__)
        raise HTTPException(status_code=503, detail="Saved probe distribution is unavailable") from None


@app.post(
    "/probe-distribution/refresh",
    summary="Collect public connected probes and atomically replace the last summary",
    description="Waits for collection and summary saving in a supervised temporary child process. A 180-second budget covers startup, downloads and summary persistence; on timeout the process is killed and awaited before releasing the separate local lock that prevents concurrent API refreshes. OS cleanup/publication adds overhead. Only successful summaries replace latest.json; failures preserve the previous summary. Does not generate raw snapshots, dated folders, SVG or Markdown. Does not write to InfluxDB.",
    responses={
        200: {"description": "Object with distribution containing the new saved summary, in the same format as GET /probe-distribution"},
        409: {"description": "Another distribution collection is running (or its lock cannot be verified)"},
        503: {"description": "Collection or persistence failed; previous collection is preserved"},
        504: {"description": "Time budget exceeded; previous collection is preserved"},
    },
)
def refresh_probe_distribution():
    try:
        return {"distribution": probe_distribution.refresh_distribution()}
    except probe_distribution.DistributionBusy:
        raise HTTPException(status_code=409, detail="Another probe distribution collection is running or its lock cannot be verified") from None
    except (TimeoutError, requests.Timeout):
        logger.warning("Probe distribution refresh timed out")
        raise HTTPException(status_code=504, detail="Probe distribution refresh timed out; previous collection is preserved") from None
    except (requests.RequestException, OSError, ValueError, KeyError, TypeError) as error:
        logger.warning("Probe distribution refresh failed (%s)", type(error).__name__)
        raise HTTPException(status_code=503, detail="Probe distribution refresh failed; previous collection is preserved") from None


@app.get(
    "/ping",
    summary="Read individual ping results in [start, stop)",
    responses={
        404: {"description": "No probe selected, or probe or measurement is not configured"},
        503: {"description": "Ping history cannot be read from the database"},
    },
)
def get_ping(
    measurement_id: Annotated[int, Query(gt=0)],
    start: Annotated[datetime, Query(description="Start with timezone (ISO 8601)")],
    stop: Annotated[
        datetime, Query(description="Exclusive end with timezone (ISO 8601)")
    ],
    probe_id: Annotated[
        int | None, Query(gt=0, description="Defaults to the selected probe")
    ] = None,
):
    probe_id = resolve_probe(probe_id)
    if measurement_id not in {
        measurement["measurement_id"] for measurement in PING_MEASUREMENTS
    }:
        raise HTTPException(
            status_code=404, detail="Measurement is not configured"
        )

    if start.utcoffset() is None or stop.utcoffset() is None:
        raise HTTPException(
            status_code=422, detail="start and stop must include a timezone"
        )
    start = start.astimezone(timezone.utc)
    stop = stop.astimezone(timezone.utc)
    if start >= stop:
        raise HTTPException(status_code=422, detail="start must be before stop")
    if stop - start > timedelta(days=MAX_QUERY_DAYS):
        raise HTTPException(
            status_code=422, detail=f"Period must not exceed {MAX_QUERY_DAYS} days"
        )

    try:
        results = query_ping_results(
            probe_id=probe_id,
            measurement_id=measurement_id,
            start_time=start,
            stop_time=stop,
            **load_influxdb_config(),
        )
    except RuntimeError as error:
        # Never put credentials or raw client exceptions in the HTTP response
        # or log. The server still records the failed query's safe identifiers.
        logger.warning(
            "Ping history unavailable for probe %s, measurement %s (%s)",
            probe_id, measurement_id, type(error).__name__,
        )
        raise HTTPException(
            status_code=503, detail="Ping history is temporarily unavailable"
        ) from None

    return {
        "probe_id": probe_id,
        "measurement_id": measurement_id,
        "start": start.isoformat().replace("+00:00", "Z"),
        "stop": stop.isoformat().replace("+00:00", "Z"),
        "count": len(results),
        "results": results,
    }

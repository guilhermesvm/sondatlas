import logging
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import FastAPI, HTTPException, Query

from ripe_atlas_tcc.influxdb_queries import query_ping_results
from ripe_atlas_tcc.settings import (
    PING_MEASUREMENTS,
    PROBE_ID,
    load_influxdb_config,
)


logger = logging.getLogger(__name__)
MAX_QUERY_DAYS = 60
app = FastAPI(
    title="RIPE Atlas Ping History",
    description="Read stored ping results for the configured probe and targets.",
    version="0.1.0",
)


def validate_probe(probe_id):
    if probe_id != PROBE_ID:
        raise HTTPException(status_code=404, detail="Probe is not configured")


@app.get("/targets", summary="List configured ping targets")
def get_targets(probe_id: Annotated[int, Query(gt=0)] = PROBE_ID):
    validate_probe(probe_id)
    return {
        "probe_id": probe_id,
        "targets": [dict(measurement) for measurement in PING_MEASUREMENTS],
    }


@app.get(
    "/ping",
    summary="Read individual ping results in [start, stop)",
    responses={
        404: {"description": "Probe or measurement is not configured"},
        503: {"description": "Ping history cannot be read from the database"},
    },
)
def get_ping(
    measurement_id: Annotated[int, Query(gt=0)],
    start: Annotated[datetime, Query(description="Start with timezone (ISO 8601)")],
    stop: Annotated[
        datetime, Query(description="Exclusive end with timezone (ISO 8601)")
    ],
    probe_id: Annotated[int, Query(gt=0)] = PROBE_ID,
):
    validate_probe(probe_id)
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

# RIPE Atlas TCC

Data ingestion pipeline developed for the undergraduate thesis **Platform for
Monitoring and Analyzing Internet Performance and Connectivity Using RIPE
Atlas Probe Data**.

## Initial goal

Retrieve public results from the automatic measurements performed by RIPE
Atlas probe `1017210` and prepare them for later storage in InfluxDB and
visualization in dashboards.

## Current status

The Stage 2 pipeline supports one-off and continuous execution, while
structured logging and support for additional measurements are still pending.
A small Stage 3 integration has also begun to validate persistence. At this
point, `fetch_results.py`:

- queries the RIPE Atlas REST API v2;
- retrieves a 15-minute initial history and later resumes from its checkpoint;
- recovers all safely available results after an interruption;
- keeps a 5-minute safety delay before collecting each window;
- records the last successfully processed window in a local checkpoint;
- retries temporary RIPE Atlas API failures with limited exponential delays;
- can repeat collection cycles at a configurable polling interval;
- announces polling startup and each upcoming collection window once;
- shuts down cleanly when interrupted with `Ctrl+C`;
- filters results from probe `1017210`;
- collects K-root built-in measurement `1001` and Google well-known
  measurement `86206926`;
- maintains an independent checkpoint for each measurement;
- saves the original API response as a formatted JSON file in `data/raw/`;
- normalizes ping results into a stable internal structure;
- saves normalized results as a formatted JSON file in `data/normalized/`;
- writes normalized ping results to InfluxDB;
- displays ping results in the console.

The generated filename identifies the measurement, probe, and queried UTC
time range. For example:

```text
measurement-1001_probe-1017210_2026-09-30_02-17-38_UTC--2026-09-30_02-32-38_UTC.json
```

Files generated in `data/raw/` and `data/normalized/` are local artifacts and
are not tracked by Git. The `.gitkeep` files only preserve the directories in
the repository.

The local checkpoint is stored in `data/state/collection_state.json`. It keeps
separate progress for each measurement and probe and is updated only after the
complete window has been successfully persisted. This allows later executions
to resume from the end of the previous window instead of recalculating a
rolling time range. A new request is made only when at least five minutes are
available, and it recovers the complete safe backlog. The generated state file
is not tracked by Git.

## Project structure

```text
src/ripe_atlas_tcc/
    pipeline.py             coordinates one ingestion run
    backfill_state.py       stores resumable historical-load progress
    collection_state.py     calculates windows and stores collection progress
    execution_lock.py       prevents concurrent pipeline processes
    settings.py             defines the ping catalog and loads configuration
    ripe_atlas_client.py    communicates with the RIPE Atlas API
    normalization.py        normalizes ping results
    json_storage.py         stores raw and normalized JSON files
    influxdb_storage.py     writes normalized points to InfluxDB
    influxdb_queries.py     reads ping history by probe, measurement, and period
    api.py                  exposes read-only HTTP endpoints for ping history
    console_output.py       formats terminal output
```

The root `fetch_results.py` file is a compatibility entry point that delegates
execution to the package.

## Prerequisites

- Python 3.11 or later;
- Git Bash on Windows;
- Docker Desktop.

## Environment setup

From the project directory, create a virtual environment:

```bash
python -m venv .venv
```

Activate the virtual environment in Git Bash:

```bash
source .venv/Scripts/activate
```

Install the project and development dependencies in editable mode:

```bash
python -m pip install -e ".[dev]"
```

Editable mode makes the virtual environment reference the source code in
`src/`, so local code changes are available without reinstalling the project.
The `(.venv)` prefix in the terminal indicates that the virtual environment is
active.

## Starting InfluxDB

The project uses InfluxDB OSS 2.9.1 in a Docker container. Start the service
from the project directory:

```bash
docker compose up -d
```

Check its status:

```bash
docker compose ps
```

The server and its web interface are available only on this computer at
`http://localhost:8086`. The data and server configuration are stored in named
Docker volumes, so stopping or recreating the container does not remove them.

On the first start, open `http://localhost:8086` and complete the setup with:

- an administrator username and a strong password;
- organization name `network-measurement-platform`;
- bucket name `network-measurement-platform`;
- no expiration for the bucket retention period.

The initial setup creates an operator token. Do not use this broad token in the
Python pipeline. In the InfluxDB interface, open **Load Data > API Tokens** and
create a read/write token limited to the `network-measurement-platform` bucket.
Copy it when it is shown and store it only in the local `.env` file.

Stop the service without deleting the container or volume:

```bash
docker compose stop
```

## InfluxDB configuration

For a new checkout, create a local configuration file from the tracked
example:

```bash
cp .env.example .env
```

If `.env` already exists from the previous InfluxDB 3 setup, edit it instead of
copying the example over it. Its InfluxDB configuration must use the following
keys:

```dotenv
INFLUXDB_URL=http://localhost:8086
INFLUXDB_ORG=network-measurement-platform
INFLUXDB_BUCKET=network-measurement-platform
INFLUXDB_TOKEN={replace_with_your_influxdb_api_token}
POLLING_INTERVAL_SECONDS=60
```

Replace the token placeholder with the read/write token created for the
pipeline. The URL, organization and bucket must match the values used during
setup. The real `.env` file contains a secret and is not tracked by Git.

Validate that Python can reach InfluxDB and access the configured bucket:

```bash
python scripts/check_influxdb.py
```

The command checks the server health, authentication and bucket access without
writing test data or displaying the token.

## Running the script

With the virtual environment active, run one collection cycle:

```bash
python fetch_results.py
```

The package entry point provides an equivalent command:

```bash
python -m ripe_atlas_tcc
```

Add `--poll` to either command to keep the pipeline running continuously:

```bash
python fetch_results.py --poll
python -m ripe_atlas_tcc --poll
```

Each cycle checks the checkpoint and collects only when a complete safe
interval is available. The default polling interval is 60 seconds and can be
changed with `POLLING_INTERVAL_SECONDS` in `.env`. Press `Ctrl+C` to stop
polling. While waiting, the time from which the next complete window can be
queried is printed only once instead of being repeated at every check.

## Initializing all available history

Use the manual `--all-time` mode to initialize an empty bucket with the
available K-root and Google history since the probe first connected:

```bash
python fetch_results.py --all-time
```

The equivalent package command is:

```bash
python -m ripe_atlas_tcc --all-time
```

The command fixes one safe end time when it starts and processes each
measurement in daily blocks. Progress is stored separately in
`data/state/backfill_state.json`, so an interrupted execution can resume from
its last completed block. Operational checkpoints are updated only after the
entire backfill succeeds.

During the load, the terminal prints one compact line per block with the
target, overall block number, date interval, results found, and points written.
The block number remains relative to the complete historical interval when an
interrupted backfill is resumed.

Do not run normal collection or polling concurrently with the backfill. A
local lock prevents commands from this project from overlapping. If a process
is forcibly terminated and leaves `data/state/pipeline.lock` behind, confirm
that no pipeline process is running before removing that lock file manually.

The initial backfill is intended for a new empty bucket. The existing prototype
bucket should be preserved until the complete load is validated.

## Reading stored ping history

Use `query_ping_results()` to read individual pings from the configured bucket:

```python
from datetime import datetime, timezone

from ripe_atlas_tcc.influxdb_queries import query_ping_results
from ripe_atlas_tcc.settings import load_influxdb_config

records = query_ping_results(
    probe_id=1017210,
    measurement_id=1001,  # Use 86206926 for Google.
    start_time=datetime(2026, 8, 26, 2, 3, 41, tzinfo=timezone.utc),
    stop_time=datetime(2026, 10, 10, 19, 13, 27, tzinfo=timezone.utc),
    **load_influxdb_config(),
)
print(len(records))
```

IDs must be positive integers and dates must include a timezone, with start
strictly before stop. The interval includes start and excludes stop. Inputs
are bound through the official client's query parameters rather than inserted
into the Flux expression.

The function returns plain dictionaries ordered chronologically, with ISO 8601
UTC timestamps, integer IDs, destination metadata, packet counts, loss, and
minimum/average/maximum RTT. Distinct destination IPs retain their own records.
Missing fields are `None` (`null` in JSON); an empty period returns `[]`.
Client failures raise `RuntimeError` with safe query context. The function
reads existing data without aggregating, filling gaps, or writing to the database.

The validated backfill interval above contains 8,195 K-root records and 7,561
Google records for probe `1017210`. A small HTTP API exposes this query;
the React interface is the next increment.

## Running the read-only HTTP API

Update the editable installation to include the API and test dependencies:

```bash
python -m pip install -e ".[dev]"
```

Start the API from the project directory with the virtual environment active:

```bash
python -m uvicorn ripe_atlas_tcc.api:app --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000/docs` for the interactive API documentation. Keep
this terminal open and use a second terminal for requests; press `Ctrl+C` to
stop the server. The API is local, has no authentication, and is intended for
this development environment.

The backend loads `INFLUXDB_URL`, `INFLUXDB_ORG`, `INFLUXDB_BUCKET`, and
`INFLUXDB_TOKEN` using the existing configuration loader. Credentials stay on
the server and are not accepted as request parameters or returned in responses.
For a separately deployed API process, provide a token limited to reading the
historical bucket as its `INFLUXDB_TOKEN`; the ingestion process still needs its
own read/write token. No database writes or collection commands are exposed.

List the configured targets for the current probe:

```bash
curl "http://127.0.0.1:8000/targets?probe_id=1017210"
```

```json
{
  "probe_id": 1017210,
  "targets": [
    {"measurement_id": 1001, "target_name": "K-root", "measurement_category": "built-in"},
    {"measurement_id": 86206926, "target_name": "Google", "measurement_category": "well-known"}
  ]
}
```

This endpoint describes the collection catalog, not whether a particular
period contains records; it does not query the database.

Read the validated backfill interval (use `86206926` for Google):

```bash
curl --get "http://127.0.0.1:8000/ping" \
  --data-urlencode "probe_id=1017210" \
  --data-urlencode "measurement_id=1001" \
  --data-urlencode "start=2026-08-26T02:03:41Z" \
  --data-urlencode "stop=2026-10-10T19:13:27Z"
```

The JSON response has `probe_id`, `measurement_id`, `start`, `stop`, `count`,
and `results`. The latter contains the same ordered individual records as
`query_ping_results()`. Unavailable metrics remain `null`. The probe defaults
to `1017210`; measurement, start, and stop are required. Only the current probe
and configured ping measurements are supported.

Use ISO 8601 timestamps with a timezone, with `start < stop`. Bounds are
normalized to UTC and the interval is `[start, stop)`. A request may span at
most 60 days, including the current backfill. Longer periods must be requested
in separate intervals; this increment does not aggregate or paginate results.

| Status | Meaning |
|---|---|
| `200` | Query succeeded, including an empty period (`count: 0`, `results: []`) |
| `404` | Probe or measurement is not in the configured catalog |
| `422` | Missing/invalid parameter, timezone, period order, or period over 60 days |
| `503` | Database/configuration failure; response omits credentials and raw client errors |

Real HTTP validation confirmed 8,195 K-root and 7,561 Google records in the
backfill interval, matching counts and temporal bounds from the previous
increment. It also confirmed an empty period returns `200` and a timestamp
without timezone returns `422`.

Run only the controlled HTTP tests, or run the complete suite:

```bash
python -m pytest -q tests/test_api.py
python -m pytest -q
```

The HTTP tests replace the database query and configuration with controlled
implementations; they do not access InfluxDB or read the real local secrets.

## Running the tests

The tests replace external HTTP calls with controlled responses, so they do
not depend on Internet access or probe availability.

```bash
python -m pytest
```

GitHub Actions also runs the test suite automatically after every push and for
every pull request. Its workflow is defined in `.github/workflows/tests.yml`.

## Removing collected JSON files

To remove all generated `.json` files from `data/raw/` and
`data/normalized/`, run:

```bash
python scripts/cleanup_json.py
```

This operation permanently removes the local raw and normalized JSON files.
Archive any data required for later auditing before running it. The command
does not remove `.gitkeep` files or the collection checkpoint in `data/state/`.

To leave the virtual environment:

```bash
deactivate
```

## Planned architecture

```text
Probe 1017210
    -> RIPE Atlas infrastructure
    -> API REST v2
    -> Python pipeline on Windows
    -> raw and normalized local storage
    -> InfluxDB
    -> dashboard
```

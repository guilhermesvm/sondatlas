# RIPE Atlas TCC

Data ingestion pipeline developed for the undergraduate thesis **Platform for
Monitoring and Analyzing Internet Performance and Connectivity Using RIPE
Atlas Probe Data**.

## Initial goal

Retrieve public results from the automatic measurements performed by RIPE
Atlas probe `1017210` (the author's probe) and prepare them for later storage in InfluxDB and
visualization in dashboards.

## Current status

The local prototype ingests K-root and Google pings, stores their history in
InfluxDB, and exposes it through a local HTTP API and React dashboard with
period summaries and target comparison. Collection supports one-off execution,
continuous polling, and resumable all-time backfill.
The separate global view reads saved public probe distribution data and offers
manual refresh; it never writes global probe metadata to InfluxDB.

The probe is chosen by its public ID with `--probe-id` and saved locally; the
K-root and Google measurement catalog remains fixed in Python. InfluxDB, the
pipeline, the API and the dashboard run together with Docker Compose; a fresh
installation was validated on Windows.

## Quick start with Docker Compose

Requirements: Docker Desktop, or Docker Engine with the Compose plugin
**2.24.0 or later** (check with `docker compose version`; older versions reject
the optional `.env`). No Python and no `.env` are needed. Your probe runs
separately (see `lab/README.md`).

```bash
docker compose up -d --build
docker compose exec pipeline python fetch_results.py --probe-id <your probe ID>
```

1. On every `up`, the short-lived `init` service checks the InfluxDB password
   and token in the `influxdb2-secrets` volume. Only on the first start does it
   generate them, at random and without displaying them; later it changes
   nothing and exits.
2. On the first start, InfluxDB configures itself from those files (user
   `admin`, organization, bucket and token). This happens only when the
   database volume is empty; an existing database is never reconfigured.
3. Selecting the probe starts collection at the next polling cycle.

Open the dashboard at `http://127.0.0.1:8080/` and follow collection with
`docker compose logs -f pipeline` (look for `Pontos enviados ao InfluxDB`).
The InfluxDB interface is at `http://localhost:8086/`; log in as `admin` with
the password shown by:

```bash
docker compose exec influxdb2 cat /run/kit-secrets/influxdb-admin-password
```

If the database already existed before this setup (for example, configured by
hand), no password is generated and that file does not exist: keep using the
password you chose then.

Every port listens only on this computer.

The password and token live in a Docker volume next to the database, so they
are created and deleted together:

| You delete | Next `docker compose up` |
|---|---|
| Everything (`docker compose down -v`) | Starts from zero with new secrets |
| Only the database volumes | Configures a new database with the same secrets |
| Only `influxdb2-secrets` | `init` stops with a message instead of creating a token the database does not know; delete the database volumes too, or set `INFLUXDB_TOKEN` in `.env` |

If `docker compose up` reports `port is already allocated`, choose another
port in `.env` and run the same command again:

```dotenv
WEB_PORT=8081       # dashboard, default 8080
API_PORT=8001       # HTTP API, default 8000
INFLUXDB_PORT=8087  # InfluxDB, default 8086
```

Only the port on this computer changes; the containers keep talking to each
other on the internal ports, so the token and the rest of `.env` stay the same.
When running Python on the host instead, also point `INFLUXDB_URL` to the new
InfluxDB port, and run `npm run dev` with `RIPE_ATLAS_API_URL` set to the new
API port.

The pipeline and the API use the generated administrator token. This is
acceptable only because everything runs locally; do not expose these ports to
a network. An `INFLUXDB_TOKEN` in `.env` takes precedence over the generated
one, which keeps older installations configured by hand working.

At this point, `fetch_results.py`:

- queries the RIPE Atlas REST API v2;
- retrieves a 15-minute initial history and later resumes from its checkpoint;
- recovers all safely available results after an interruption;
- keeps a 5-minute safety delay before collecting each window;
- records the last successfully processed window in a local checkpoint;
- retries temporary RIPE Atlas API failures with limited exponential delays;
- can repeat collection cycles at a configurable polling interval;
- announces polling startup and each upcoming collection window once;
- shuts down cleanly when interrupted with `Ctrl+C`;
- filters results from the selected probe;
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
    api.py                  exposes ping reads and manual distribution refresh
    probe_distribution.py  collects, aggregates and saves public probe metadata
    console_output.py       formats terminal output
    init_secrets.py         creates the InfluxDB password and token for Compose
```

The root `fetch_results.py` file is a compatibility entry point that delegates
execution to the package.

## Prerequisites

- Python 3.11 or later (development on the host only);
- Git Bash on Windows;
- Docker Desktop, or Docker Engine with Compose 2.24.0 or later.

For the React dashboard, also install Node.js 22.12+ (22.x) or Node.js 24.x,
with npm. Python-only collection and API commands do not require Node.js.

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

The project uses InfluxDB OSS 2.9.1 in a Docker container. Start only the
database from the project directory:

```bash
docker compose up -d influxdb2
```

`docker compose up -d --build` without a service name also builds and starts
the pipeline in polling mode, the HTTP API and the dashboard (see
[Running the pipeline with Docker Compose](#running-the-pipeline-with-docker-compose),
[Running the API with Docker Compose](#running-the-api-with-docker-compose) and
[Running the dashboard with Docker Compose](#running-the-dashboard-with-docker-compose)).
All services restart automatically when Docker starts, unless they were
stopped with `docker compose stop`.

Check its status:

```bash
docker compose ps
```

The server and its web interface are available only on this computer at
`http://localhost:8086`. The data and server configuration are stored in named
Docker volumes, so stopping or recreating the container does not remove them.

The first start configures InfluxDB automatically, with organization and
bucket `network-measurement-platform`, no retention limit, and a generated
password and administrator token (see
[Quick start](#quick-start-with-docker-compose)). In a manual or shared
installation, do not give this broad token to the pipeline: in the InfluxDB
interface, open **Load Data > API Tokens**, create a read/write token limited
to the bucket and store it only in `.env` as `INFLUXDB_TOKEN`.

Stop the service without deleting the container or volume:

```bash
docker compose stop
```

## InfluxDB configuration

Docker Compose works without `.env`. To run the pipeline or the API on the
host (`.venv`), create it from the tracked example and add the token that
Compose generated:

```bash
cp .env.example .env
docker compose exec api cat /run/kit-secrets/influxdb-token
```

Copy the printed value into `INFLUXDB_TOKEN=` in `.env`; do not paste it
anywhere else.

If `.env` already exists from the previous InfluxDB 3 setup, edit it instead of
copying the example over it. Its InfluxDB configuration must use the following
keys:

```dotenv
INFLUXDB_URL=http://localhost:8086
INFLUXDB_ORG=network-measurement-platform
INFLUXDB_BUCKET=network-measurement-platform
INFLUXDB_TOKEN={your_influxdb_api_token}
POLLING_INTERVAL_SECONDS=60
```

Replace the token placeholder with the token generated by Compose or a
read/write token created for the pipeline. The URL, organization and bucket must match the values used during
setup. The real `.env` file contains a secret and is not tracked by Git.

Validate that Python can reach InfluxDB and access the configured bucket:

```bash
python scripts/check_influxdb.py
```

The command checks the server health, authentication and bucket access without
writing test data or displaying the token.

## Running the script

On the first run, select your probe by its ID (listed at
https://atlas.ripe.net/probes/mine). The ID is public, so it is not kept in
`.env`:

```bash
python fetch_results.py --probe-id 1017210
```

The pipeline checks that the probe exists in RIPE Atlas and saves the ID in
`data/state/probe.json`. On its own, `--probe-id` only selects the probe; add
`--poll` or `--all-time` to select and collect in one command. Later runs use
the saved probe; run `--probe-id` again to change it, even while `--poll` is
running in another terminal. An unknown probe is rejected without changing the
saved one, and without a saved probe a single cycle or `--all-time` stops with
a message asking for `--probe-id`.

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

Polling reads the saved probe at every cycle. Without a selected probe it
waits, printing the message once, and starts collecting as soon as a probe is
selected; a probe change applies at the next cycle without a restart.

### Running the pipeline with Docker Compose

The pipeline can run in a container, without Python on the host:

```bash
docker compose up -d --build pipeline
docker compose exec pipeline python fetch_results.py --probe-id 1017210
docker compose logs -f pipeline
```

The `pipeline` service runs `fetch_results.py --poll` and shares the project's
`data/` folder, so raw and normalized JSON files and the state stay in the same
places. Run other commands inside the running container with
`docker compose exec pipeline python fetch_results.py ...` (for example
`--all-time`); `docker compose run` would start a separate container that the
execution lock cannot see. `docker compose stop pipeline` stops polling like
`Ctrl+C` and `docker compose start pipeline` resumes it; InfluxDB keeps running.

Do not run the host pipeline and the container pipeline at the same time:
they share `data/state/`, but neither can check the other's process. Stop the
container before running `python fetch_results.py` on the host.

## Initializing all available history

Use the manual `--all-time` mode to load the available history of the
measurements in the catalog (currently the K-root and Google pings) for the
selected probe since it first connected. It never runs
automatically; normal collection starts from the moment the probe is selected:

```bash
python fetch_results.py --all-time
```

The equivalent package command is:

```bash
python -m ripe_atlas_tcc --all-time
```

The command fixes one safe end time when it starts and processes each
measurement in daily blocks. Progress is stored per probe in
`data/state/backfill/probe-<ID>.json`, so an interrupted execution can resume
from its last completed block and each probe has its own backfill. Operational
checkpoints are updated only after the entire backfill succeeds. A completed
backfill is not repeated, and a probe that has never connected has no history
to load; both cases end with a message and collect nothing. A state file from
before per-probe backfills (`data/state/backfill_state.json`) is moved to its
probe's path on the next `--all-time` run.

During the load, the terminal prints one compact line per block with the
target, overall block number, date interval, results found, and points written.
The block number remains relative to the complete historical interval when an
interrupted backfill is resumed.

Do not run normal collection or polling concurrently with the backfill. A
local lock prevents commands from this project from overlapping. If a process
is forcibly terminated and leaves `data/state/pipeline.lock` behind, the next
execution checks the recorded PID and recovers the lock only if that process
has ended. A live PID (even if reused by an unrelated process), an invalid lock
or an inconclusive process check blocks collection without deleting the lock.
Manual removal is only appropriate after confirming no pipeline is running.

A native OS lock on the auxiliary `data/state/pipeline.lock.guard` also prevents
simultaneous recovery attempts. This auxiliary file stays on disk; its presence
does not mean the pipeline is running. Do not delete it during execution. The
OS releases its lock when the owning process ends, even after an abrupt exit.
This uses the Python standard library on Windows and Unix; commands, checkpoints
and collection behavior remain unchanged.

Points from different probes share the bucket and are separated by the
`probe_id` tag.

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
Google records for probe `1017210`. A small HTTP API exposes this query and
the React dashboard lets users explore it.

## Running the local HTTP API

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

### Running the API with Docker Compose

The API can also run in a container, without the virtual environment:

```bash
docker compose up -d --build api
```

It uses the same `.env`, reaches InfluxDB as `influxdb2` inside Compose, and
shares the project's `data/` folder with the pipeline. Stop a host `uvicorn` on
port 8000 first. The API and the pipeline share one image,
`ripe-atlas-tcc-app`: after changing Python code, run `docker compose up -d
--build` without a service name so both restart with the same code. Stop the
container with
`docker compose stop api` and read its output with `docker compose logs api`.

The backend loads `INFLUXDB_URL`, `INFLUXDB_ORG`, `INFLUXDB_BUCKET`, and
`INFLUXDB_TOKEN` using the existing configuration loader. Credentials stay on
the server and are not accepted as request parameters or returned in responses.
For a separately deployed API process, provide a token limited to reading the
historical bucket as its `INFLUXDB_TOKEN`; the ingestion process still needs its
own read/write token. Ping routes remain read-only: no database writes or ping
collection commands are exposed. The separate distribution refresh route
queries public metadata and saves only the latest summary without credentials.

Read, change or stop following the selected probe (the same check and file as
`--probe-id`; a running `--poll` follows the change on its next cycle):

```bash
curl http://127.0.0.1:8000/probe
curl -X PUT -H "Content-Type: application/json" -d '{"probe_id": 1017210}' http://127.0.0.1:8000/probe
curl -X DELETE http://127.0.0.1:8000/probe
```

`GET` returns `{"probe_id": null}` before the first selection. `PUT` answers
404 for an unknown probe and 503 when RIPE Atlas is unavailable, keeping the
previous selection in both cases; on success it also returns `is_public`.
Results of non-public probes did not appear to anonymous API requests in a
test on 2026-10-23, so this project may collect nothing for them.
`DELETE` removes the selection: `--poll` waits until a probe is selected again,
while stored results and checkpoints are kept, so selecting the same probe
later resumes from its last checkpoint.

List the configured targets for the selected probe:

```bash
curl "http://127.0.0.1:8000/targets"
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
to the one selected with `--probe-id`; measurement, start, and stop are
required. Only the selected probe and configured ping measurements are
supported: without a selected probe, or for another probe, the API returns `404`.

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

## Running the React dashboard

The dashboard in `frontend/` uses React and TypeScript. It reads the existing
API; it does not collect measurements or write to InfluxDB. Its first screen
supports only the selected probe and the K-root and Google pings in **Minha
probe**. **Rede global** presents the saved distribution study with manual
refresh, independently from the ping history.

Keep InfluxDB running. In a terminal at the repository root, activate the
Python environment and start the backend:

```bash
source .venv/Scripts/activate
python -m uvicorn ripe_atlas_tcc.api:app --host 127.0.0.1 --port 8000
```

In a second terminal, install the locked frontend dependencies and start Vite:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://127.0.0.1:5173/`. Keep both terminals open; use `Ctrl+C` to stop
each server. If they are already running, reuse them instead of starting
another process on the same port. Vite forwards `/api` requests to the local
backend on port 8000. No database token or Flux query belongs in the frontend.
The development server and API are bound to localhost; external hosting is
outside this increment.

Restart the API and Vite after updating this code so both load the new routes
and proxy settings. For a separate validation instance, start the API on port
8001, then run `RIPE_ATLAS_API_URL=http://127.0.0.1:8001 npm run dev -- --port 5174`
in Git Bash from `frontend/`. This optional variable configures only Vite's
server-side proxy and contains no credentials; normal startup still uses 8000.

### Running the dashboard with Docker Compose

Without Node.js on the host, build and serve the dashboard together with the
API:

```bash
docker compose up -d --build web api
```

Open `http://127.0.0.1:8080/`. The container compiles the frontend with
`npm run build` and serves it with `vite preview`, which forwards `/api` to the
`api` service. It does not reload on code changes: run the same command again
after editing the frontend, or keep using `npm run dev` on port 5173 for
development.

Choose a target and **Últimas 24 horas** (default), **Últimos 7 dias**, or
**Período personalizado**, then click **Consultar**. Quick periods cover exactly
24 or 168 elapsed hours ending when the request is submitted, not at the last
stored result. Each consultation requests both targets with exactly the same
UTC bounds. Changing the period clears both results without fetching; changing
the target switches the detailed charts using the already loaded data.

The period summary compares K-root and Google side by side (stacked on small
screens). **RTT típico · mediana** is the median of available per-round mean
RTTs, not individual packet RTTs. With an even number of values, it averages
the two central values. **Maior RTT médio observado** shows the greatest round
mean RTT and its local timestamp, not the packet-maximum field; ties use the
earliest observation. The count of rounds with available RTT is also shown.

**Rodadas com perda / calculáveis** counts rounds with loss greater than zero
against rounds with an available loss metric, including zero-loss rounds in
the denominator. It is neither average packet loss nor connection availability.
Unavailable metrics are excluded from their respective calculations. Without
usable values, summaries show **Indisponível**; an empty target shows **Sem
registros neste período**. If either query fails, no partial comparison is
shown. The two targets may have different observation counts and timestamps:
these are period summaries, not paired or causal comparisons.

The screen identifies the browser's timezone. Inputs, bounds, chart labels and
observation details use that local timezone; API requests and stored timestamps
remain UTC. Custom inputs always use **DD/MM/YYYY HH:mm:ss**, with a 24-hour
clock and optional seconds (default `00`); for example, **09/10/2026 18:00:00**
means October 9, not September 10. Validated text fields replace the native
datetime picker so the input format does not depend on the browser/OS locale.
Custom periods keep the API's 60-day limit and `[start, stop)`
semantics. Invalid dates and nonexistent local daylight-saving times are
rejected. For an ambiguous repeated local time, JavaScript selects its first
occurrence; observation details show the date-specific UTC offset.

RTT and loss are stacked in one compact panel with aligned time axes, units
and local dates/times. Hover over or touch a chart to inspect a nearby
**stored observation**, not an interpolated value. The discreet range selector
below each chart supports touch and keyboard arrows and can inspect separate
records that share a timestamp. Compact details show the full time and value;
loss details also show received/sent packet counts. Open **Sobre esta medição**
for technical metadata, exact queried bounds, the last inspected destination IP
and interpretation notes. Availability counts refer to the queried records,
not to a connection uptime estimate or a diagnosis.

Metric labels use at most one decimal place. Positive values below 0.1 appear
as `<0,1`, not zero; unavailable metrics remain **Indisponível**. Formatting
does not change the original observations or the values used to plot them.

Unavailable metrics stay unavailable, never zero. Lines break at unavailable
metrics and collection gaps exceeding eight minutes (twice the current nominal
ping interval). A successful empty period is distinct from an API/database
failure. Packet loss, missing metrics and missing records do not establish a
cause or prove the quality of the entire connection.

### Tests, build and manual review

From `frontend/`:

```bash
npm test
npm run build
```

Tests run with controlled responses and a local DOM implementation. They do
not require the backend, InfluxDB, Chromium or a browser download. They cover
Brazilian date input, 24-hour display, periods and UTC conversion, querying
targets, loading/retry/error states,
point inspection, median/maximum/loss summaries, identical target periods,
display-only precision and the distinction between loss,
unavailable metrics and empty periods. `npm run build` checks TypeScript and
generates `frontend/dist/`.
To inspect that build locally, run `npm run preview` and open the URL it prints;
keep the backend running. The preview is not a deployment server.

For a manual visual check in your browser:

1. Query both targets with a quick period; confirm the probe, target, timezone
   and queried bounds. An empty recent period is possible without recent data.
2. For the known backfill, choose custom bounds corresponding to
   `2026-08-26T02:03:41Z` through `2026-10-10T19:13:27Z` in your local timezone.
   In `America/Sao_Paulo`, enter **25/08/2026 23:03:41** through
   **10/10/2026 16:13:27**. Expected counts are 8,195 K-root and 7,561 Google
   records. Other browser timezones require different local input values.
   Compare both summaries; switch the destination to inspect its charts without
   querying again. For this fixed historical range, expected medians are about
   **34.2 ms** (K-root) and **27.5 ms** (Google), with loss rounds **61 / 7,530**
   and **23 / 7,434**, respectively.
3. Inspect chart points using mouse/touch and the selector with keyboard
   arrows. Confirm units, seconds/offsets, packet counts and unavailable values.
   Open **Sobre esta medição** to check technical metadata, the last inspected
   IP and interpretation notes. Zero and unavailable must remain distinct.
4. Query a period before the probe first connected to check the empty message.
   For example, August 1–2, 2026. Check that no zero-valued graph appears.
5. Try reversed custom dates; then stop the backend temporarily and query
   again. Validation/failure messages must not look like a successful empty
   period. Restart it afterward.
6. Check readability at desktop and narrow/mobile widths. Visual approval is
   manual; passing automated tests does not replace that review.

Run the Python suite independently from the repository root:

```bash
python -m pytest -q
```

## Running the tests

The tests replace external HTTP calls with controlled responses, so they do
not depend on Internet access or probe availability.

```bash
python -m pytest
```

GitHub Actions also runs the test suite automatically after every push and for
every pull request. Its workflow is defined in `.github/workflows/tests.yml`.

## Removing collected files

To remove generated `.json` files from `data/raw/` and `data/normalized/`,
the saved distribution summary and any remaining legacy dated collection
folders under `data/probe-distribution/`, run:

```bash
python scripts/cleanup_json.py
```

This operation permanently removes the local raw and normalized JSON files
and any legacy distribution folders. It also removes
`latest.json` and `latest.tmp`, so the global view returns to its no-collection
state until you request a new refresh. Cleanup refuses to run during a
distribution refresh and preserves its persistent `.refresh.lock.guard`.
Archive any data required for later auditing before running it. The command
does not remove `.gitkeep` files, the collection checkpoint in `data/state/`,
or research evidence archived separately under `data/evidence/`.

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

## Global probe distribution

With the API and frontend running, open **Rede global** and click
**Atualizar distribuição**. The view shows unique public connected probes,
Brazil's count/share, the ten largest country counts plus Brazil, and the
collection dates. Anchors are included; private and disconnected probes are not.
The source is the [RIPE Atlas probe API](https://atlas.ripe.net/docs/apis/rest-api-manual/probes/listing-probes/).

Opening the view only reads saved data. Refresh shows a spinner, keeps the
previous collection visible, and replaces it only after successful collection
and saving. Failures preserve previous data; concurrent refreshes are refused.
The global view requires no InfluxDB, token or credits and does not affect ping
collection or checkpoints. Duration depends on the API and network; the backend
uses a 180-second collection budget, plus process cleanup/publication overhead.

For direct API access:

```bash
curl http://127.0.0.1:8000/probe-distribution
curl --max-time 240 -X POST http://127.0.0.1:8000/probe-distribution/refresh
```

No saved collection returns `200` with `distribution: null`. Refresh failures
return `409` (busy), `503` (collection/storage failure) or `504` (timeout).
See [local API documentation](http://127.0.0.1:8000/docs) for the full contract;
check the API terminal for errors. After a browser timeout, read saved data before
retrying, since the backend may still be collecting.

The dashboard stores only `data/probe-distribution/latest.json`: counts, source,
UTC dates and consistency metadata, matching the API response. A successful
refresh replaces it atomically; failures preserve it. Refresh does not generate
dated folders, raw snapshots, SVG or Markdown. React draws the chart.

A selected raw collection is archived separately under
`data/evidence/probe-distribution/` for research verification; it is not renewed
on refresh or deleted by `python scripts/cleanup_json.py`. Keep this evidence
with the code version used for the study. Cleanup removes the operational
summary and raw/normalized ping JSONs, not InfluxDB data or checkpoints.

This is a paginated observation over an interval, not an instantaneous census.
Counts are not population-normalized and do not establish Internet quality,
territorial coverage, participation causes or learning outcomes.

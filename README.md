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
operational logging and support for additional measurements are still pending.
A small Stage 3 integration has also begun to validate persistence. At this
point, `fetch_results.py`:

- queries the RIPE Atlas REST API v2;
- retrieves a 15-minute initial history and later resumes from its checkpoint;
- recovers all safely available results after an interruption;
- keeps a 5-minute safety delay before collecting each window;
- records the last successfully processed window in a local checkpoint;
- retries temporary RIPE Atlas API failures with limited exponential delays;
- can repeat collection cycles at a configurable polling interval;
- shuts down cleanly when interrupted with `Ctrl+C`;
- filters results from probe `1017210`;
- uses built-in measurement `1001`;
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
    collection_state.py     calculates windows and stores collection progress
    settings.py             loads project and InfluxDB configuration
    ripe_atlas_client.py    communicates with the RIPE Atlas API
    normalization.py        normalizes ping results
    json_storage.py         stores raw and normalized JSON files
    influxdb_storage.py     writes normalized points to InfluxDB
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
polling.

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

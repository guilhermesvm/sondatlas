# RIPE Atlas TCC

Data ingestion pipeline developed for the undergraduate thesis **Platform for
Monitoring and Analyzing Internet Performance and Connectivity Using RIPE
Atlas Probe Data**.

## Initial goal

Retrieve public results from the automatic measurements performed by RIPE
Atlas probe `1017210` and prepare them for later storage in InfluxDB and
visualization in dashboards.

## Current status

The manual flow of Stage 2 is working, while continuous polling is still
pending. A small Stage 3 integration has also begun to validate persistence
before polling is automated. At this point, `fetch_results.py`:

- queries the RIPE Atlas REST API v2;
- retrieves results from the last 15 minutes;
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

Install the project and development dependencies:

```bash
python -m pip install ".[dev]"
```

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
```

Replace the token placeholder with the read/write token created for the
pipeline. The URL, organization and bucket must match the values used during
setup. The real `.env` file contains a secret and is not tracked by Git.

## Running the script

With the virtual environment active, run:

```bash
python fetch_results.py
```

## Running the tests

The tests replace external HTTP calls with controlled responses, so they do
not depend on Internet access or probe availability.

```bash
python -m pytest
```

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

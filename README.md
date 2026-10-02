# RIPE Atlas TCC

Data ingestion pipeline developed for the undergraduate thesis **Platform for
Monitoring and Analyzing Internet Performance and Connectivity Using RIPE
Atlas Probe Data**.

## Initial goal

Retrieve public results from the automatic measurements performed by RIPE
Atlas probe `1017210` and prepare them for later storage in InfluxDB and
visualization in dashboards.

## Current status

The project is at the beginning of Stage 2. At this point,
`fetch_results.py`:

- queries the RIPE Atlas REST API v2;
- retrieves results from the last 15 minutes;
- filters results from probe `1017210`;
- uses built-in measurement `1001`;
- saves the original API response as a formatted JSON file in `data/raw/`;
- normalizes ping results into a stable internal structure;
- saves normalized results as a formatted JSON file in `data/normalized/`;
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

The project uses InfluxDB 3 Core in a Docker container. Start the service from
the project directory:

```bash
docker compose up -d
```

Check its status:

```bash
docker compose ps
```

The server is available locally at `http://localhost:8181`. Its data is stored
in a named Docker volume, so stopping or recreating the container does not
remove the database.

On the first setup, create the operator token:

```bash
docker compose exec influxdb3-core influxdb3 create token --admin
```

Store the returned token securely. Load it temporarily without displaying it:

```bash
read -s -p "Operator token: " INFLUXDB3_AUTH_TOKEN
echo
```

Create the project database:

```bash
docker compose exec \
  -e INFLUXDB3_AUTH_TOKEN="$INFLUXDB3_AUTH_TOKEN" \
  influxdb3-core \
  influxdb3 create database ripe_atlas
```

Create a separate named token for the pipeline:

```bash
docker compose exec \
  -e INFLUXDB3_AUTH_TOKEN="$INFLUXDB3_AUTH_TOKEN" \
  influxdb3-core \
  influxdb3 create token --admin --name ripe-atlas-pipeline
```

Store the new token securely and remove the operator token from the terminal
session:

```bash
unset INFLUXDB3_AUTH_TOKEN
```

Stop the service without deleting the container or volume:

```bash
docker compose stop
```

## InfluxDB configuration

Create a local configuration file from the tracked example:

```bash
cp .env.example .env
```

Open `.env` and replace `replace-with-your-token` with the named token created
for the pipeline. The real `.env` file contains a secret and is not tracked by
Git.

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

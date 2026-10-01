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
- displays ping results in the console.

The generated filename identifies the measurement, probe, and queried UTC
time range. For example:

```text
measurement-1001_probe-1017210_2026-09-30_02-17-38_UTC--2026-09-30_02-32-38_UTC.json
```

Files generated in `data/raw/` are local artifacts and are not tracked by Git.
The `.gitkeep` file only preserves the directory in the repository.

## Prerequisites

- Python 3.11 or later;
- Git Bash on Windows.

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
    -> local storage
    -> InfluxDB
    -> dashboard
```

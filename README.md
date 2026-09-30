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
- displays ping results in the console.

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

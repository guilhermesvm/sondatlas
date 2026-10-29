import json


def build_results_filename(
    measurement_id,
    probe_id,
    start_time,
    stop_time,
):
    start_label = start_time.strftime("%Y-%m-%d_%H-%M-%S_UTC")
    stop_label = stop_time.strftime("%Y-%m-%d_%H-%M-%S_UTC")

    return (
        f"measurement-{measurement_id}"
        f"_probe-{probe_id}"
        f"_{start_label}"
        f"--{stop_label}.json"
    )


def save_results(
    results,
    measurement_id,
    probe_id,
    start_time,
    stop_time,
    output_directory,
):
    output_directory.mkdir(parents=True, exist_ok=True)
    filename = build_results_filename(
        measurement_id=measurement_id,
        probe_id=probe_id,
        start_time=start_time,
        stop_time=stop_time,
    )
    output_path = output_directory / filename

    with output_path.open("w", encoding="utf-8") as file:
        json.dump(
            results,
            file,
            ensure_ascii=False,
            indent=2,
        )

    return output_path


def save_raw_results(
    results,
    measurement_id,
    probe_id,
    start_time,
    stop_time,
    output_directory,
):
    return save_results(
        results=results,
        measurement_id=measurement_id,
        probe_id=probe_id,
        start_time=start_time,
        stop_time=stop_time,
        output_directory=output_directory,
    )


def save_normalized_results(
    results,
    measurement_id,
    probe_id,
    start_time,
    stop_time,
    output_directory,
):
    serializable_results = []

    for result in results:
        serializable_result = result.copy()
        serializable_result["timestamp"] = result["timestamp"].isoformat()
        serializable_results.append(serializable_result)

    return save_results(
        results=serializable_results,
        measurement_id=measurement_id,
        probe_id=probe_id,
        start_time=start_time,
        stop_time=stop_time,
        output_directory=output_directory,
    )

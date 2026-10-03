from pathlib import Path


DATA_DIRECTORIES = ("raw", "normalized")


def delete_collected_json_files(data_directory: Path) -> list[Path]:
    deleted_files = []

    for directory_name in DATA_DIRECTORIES:
        directory = data_directory / directory_name

        if not directory.exists():
            continue

        for json_file in directory.glob("*.json"):
            json_file.unlink()
            deleted_files.append(json_file)

    return deleted_files

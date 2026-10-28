from pathlib import Path
import re
import shutil

from sondatlas.shared.execution_lock import execution_lock


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


def delete_probe_distribution_collections(data_directory: Path) -> list[Path]:
    root = data_directory.resolve() / "probe-distribution"
    if root.resolve() != root:
        raise ValueError("Distribution cleanup cannot follow a linked directory")
    if not root.exists():
        return []

    deleted_directories = []
    with execution_lock(root / ".refresh.lock"):
        directories = [
            directory for directory in root.iterdir()
            if re.fullmatch(r"\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(?:_\d{6})?_UTC", directory.name)
            and directory.is_dir()
            and not directory.is_symlink()
            and directory.resolve() == root / directory.name
        ]
        (root / "latest.json").unlink(missing_ok=True)
        (root / "latest.tmp").unlink(missing_ok=True)
        for directory in directories:
            shutil.rmtree(directory)
            deleted_directories.append(directory)
    return deleted_directories


def main():
    project_directory = Path(__file__).resolve().parent.parent
    data_directory = project_directory / "data"
    deleted_directories = delete_probe_distribution_collections(data_directory)
    deleted_files = delete_collected_json_files(data_directory)

    print(f"Deleted {len(deleted_files)} JSON file(s).")
    print(f"Deleted {len(deleted_directories)} probe distribution collection folder(s).")


if __name__ == "__main__":
    main()

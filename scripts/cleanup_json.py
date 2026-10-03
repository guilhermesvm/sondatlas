from pathlib import Path

from ripe_atlas_tcc.data_cleanup import delete_collected_json_files


def main():
    project_directory = Path(__file__).resolve().parent.parent
    deleted_files = delete_collected_json_files(project_directory / "data")

    print(f"Deleted {len(deleted_files)} JSON file(s).")


if __name__ == "__main__":
    main()

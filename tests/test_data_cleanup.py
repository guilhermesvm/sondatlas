from ripe_atlas_tcc.data_cleanup import delete_collected_json_files


def test_delete_collected_json_files_removes_only_json_files(tmp_path):
    raw_directory = tmp_path / "raw"
    normalized_directory = tmp_path / "normalized"
    state_directory = tmp_path / "state"

    raw_directory.mkdir()
    normalized_directory.mkdir()
    state_directory.mkdir()

    raw_json = raw_directory / "raw-result.json"
    normalized_json = normalized_directory / "normalized-result.json"
    raw_json.write_text("{}", encoding="utf-8")
    normalized_json.write_text("{}", encoding="utf-8")
    (raw_directory / ".gitkeep").touch()
    state_file = state_directory / "collection_state.json"
    state_file.write_text("{}", encoding="utf-8")

    deleted_files = delete_collected_json_files(tmp_path)

    assert set(deleted_files) == {raw_json, normalized_json}
    assert not raw_json.exists()
    assert not normalized_json.exists()
    assert (raw_directory / ".gitkeep").exists()
    assert state_file.exists()


def test_delete_collected_json_files_accepts_missing_directories(tmp_path):
    assert delete_collected_json_files(tmp_path) == []

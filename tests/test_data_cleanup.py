import pytest

from scripts.cleanup_json import (
    delete_collected_json_files,
    delete_probe_distribution_collections,
)
from sondatlas.shared.execution_lock import execution_lock
from sondatlas.api.probe_distribution import read_distribution


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
    assert delete_probe_distribution_collections(tmp_path) == []


def test_distribution_cleanup_removes_collections_and_reference_only(tmp_path):
    root = tmp_path / "probe-distribution"
    root.mkdir()
    directories = [root / "2026-10-11_15-51-16_UTC", root / "2026-10-11_17-35-59_469096_UTC"]
    for directory in directories:
        directory.mkdir()
        for name in ("snapshot.json", "summary.json", "countries.svg", "report.md"):
            (directory / name).write_text("generated", encoding="utf-8")
    (root / "latest.json").write_text('{"directory": "2026-10-11_15-51-16_UTC"}', encoding="utf-8")
    (root / "latest.tmp").write_text("temporary", encoding="utf-8")
    (root / ".gitkeep").touch()
    preserved = root / "notes"
    preserved.mkdir()
    (preserved / "report.md").write_text("keep", encoding="utf-8")
    evidence = tmp_path / "evidence" / "probe-distribution" / "selected"
    evidence.mkdir(parents=True)
    (evidence / "snapshot.json").write_text("archived evidence", encoding="utf-8")

    assert set(delete_probe_distribution_collections(tmp_path)) == set(directories)
    assert all(not directory.exists() for directory in directories)
    assert not (root / "latest.json").exists()
    assert not (root / "latest.tmp").exists()
    assert not (root / ".refresh.lock").exists()
    assert (root / ".refresh.lock.guard").exists()
    assert (root / ".gitkeep").exists()
    assert (preserved / "report.md").read_text(encoding="utf-8") == "keep"
    assert (evidence / "snapshot.json").read_text(encoding="utf-8") == "archived evidence"
    assert read_distribution(root) is None
    assert delete_probe_distribution_collections(tmp_path) == []


def test_distribution_cleanup_refuses_active_refresh(tmp_path):
    root = tmp_path / "probe-distribution"
    directory = root / "2026-10-11_17-35-59_469096_UTC"
    directory.mkdir(parents=True)
    reference = root / "latest.json"
    reference.write_text("preserved", encoding="utf-8")

    with execution_lock(root / ".refresh.lock"):
        with pytest.raises(RuntimeError):
            delete_probe_distribution_collections(tmp_path)
        assert directory.exists()
        assert reference.read_text(encoding="utf-8") == "preserved"

import pytest

from ripe_atlas_tcc.execution_lock import execution_lock


def test_execution_lock_prevents_concurrent_processes_and_is_removed(tmp_path):
    lock_path = tmp_path / "pipeline.lock"

    with execution_lock(lock_path):
        assert lock_path.exists()
        with pytest.raises(RuntimeError, match="already running"):
            with execution_lock(lock_path):
                pass

    assert not lock_path.exists()

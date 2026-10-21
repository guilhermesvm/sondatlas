import os
import subprocess
import sys
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

import ripe_atlas_tcc.execution_lock as locks
from ripe_atlas_tcc.execution_lock import execution_lock


def lock_owner(lock_path):
    return int(lock_path.read_text(encoding="ascii").split()[0])


def test_execution_lock_prevents_concurrent_processes_and_is_removed(tmp_path):
    lock_path = tmp_path / "pipeline.lock"

    with execution_lock(lock_path):
        assert lock_path.exists()
        with pytest.raises(RuntimeError, match="already running"):
            with execution_lock(lock_path):
                pass

    assert not lock_path.exists()


def test_lock_with_live_pid_is_preserved_even_without_native_guard(tmp_path):
    lock_path = tmp_path / "pipeline.lock"
    lock_path.write_text(str(os.getpid()), encoding="ascii")

    with pytest.raises(RuntimeError, match="already running"):
        with execution_lock(lock_path):
            pytest.fail("Must not enter while the recorded process is alive")

    assert lock_path.read_text(encoding="ascii") == str(os.getpid())


def test_lock_left_by_previous_process_with_same_pid_is_recovered(tmp_path):
    lock_path = tmp_path / "pipeline.lock"
    lock_path.write_text(f"{os.getpid()} previous-container-process", encoding="ascii")

    with execution_lock(lock_path):
        assert lock_path.read_text(encoding="ascii") == f"{os.getpid()} {locks.PROCESS_INSTANCE}"
    assert not lock_path.exists()


@pytest.mark.parametrize("content", ["", "invalid", "0", "-1", "4294967296", "\xff", "1 2 3"])
def test_invalid_lock_is_not_automatically_removed(tmp_path, content):
    lock_path = tmp_path / "pipeline.lock"
    original = content.encode("latin-1")
    lock_path.write_bytes(original)

    with pytest.raises(RuntimeError, match="Cannot verify"):
        with execution_lock(lock_path):
            pytest.fail("Cannot recover a lock without a valid owner")

    assert lock_path.read_bytes() == original


def test_unknown_process_status_preserves_lock(tmp_path, monkeypatch):
    lock_path = tmp_path / "pipeline.lock"
    lock_path.write_text("123", encoding="ascii")

    def denied(pid):
        raise PermissionError("Process inspection denied")

    monkeypatch.setattr(locks, "_process_is_running", denied)
    with pytest.raises(RuntimeError, match="Cannot verify"):
        with execution_lock(lock_path):
            pytest.fail("Must not remove an unverifiable lock")
    assert lock_path.read_text(encoding="ascii") == "123"


@pytest.mark.parametrize(
    "handle,status,error,expected",
    [(123, 258, 0, True), (123, 0, 0, False), (0, 0, 87, False),
     (0, 0, 5, None), (123, 0xFFFFFFFF, 5, None)],
)
def test_windows_process_check_is_read_only_and_closes_handles(
    monkeypatch, handle, status, error, expected,
):
    import ctypes

    kernel = SimpleNamespace(
        OpenProcess=Mock(return_value=handle),
        WaitForSingleObject=Mock(return_value=status),
        CloseHandle=Mock(),
    )
    monkeypatch.setattr(ctypes, "WinDLL", Mock(return_value=kernel), raising=False)
    monkeypatch.setattr(ctypes, "get_last_error", lambda: error, raising=False)
    monkeypatch.setattr(ctypes, "WinError", lambda value: OSError(value, "Windows error"), raising=False)
    if expected is None:
        with pytest.raises(OSError):
            locks._windows_process_is_running(456)
    else:
        assert locks._windows_process_is_running(456) is expected
    kernel.OpenProcess.assert_called_once_with(0x00100000, False, 456)
    if handle:
        kernel.WaitForSingleObject.assert_called_once_with(handle, 0)
        kernel.CloseHandle.assert_called_once_with(handle)
    else:
        kernel.WaitForSingleObject.assert_not_called()
        kernel.CloseHandle.assert_not_called()


@pytest.mark.parametrize("failure", [RuntimeError("Database unavailable"), KeyboardInterrupt()])
def test_lock_is_removed_after_failure_and_can_be_acquired_again(tmp_path, failure):
    lock_path = tmp_path / "pipeline.lock"

    with pytest.raises(type(failure)):
        with execution_lock(lock_path):
            raise failure

    assert not lock_path.exists()
    with execution_lock(lock_path):
        assert lock_owner(lock_path) == os.getpid()
    assert not lock_path.exists()


def test_recovers_lock_left_by_real_abrupt_process_exit(tmp_path):
    lock_path = tmp_path / "pipeline.lock"
    code = (
        "import os, sys; from pathlib import Path; "
        "from ripe_atlas_tcc.execution_lock import execution_lock; "
        "\nwith execution_lock(Path(sys.argv[1])): os._exit(0)"
    )
    subprocess.run([sys.executable, "-c", code, str(lock_path)], check=True, timeout=10)
    owner = lock_owner(lock_path)
    assert not locks._process_is_running(owner)

    with execution_lock(lock_path):
        assert lock_owner(lock_path) == os.getpid()
    assert not lock_path.exists()


def test_two_processes_cannot_recover_same_stale_lock(tmp_path):
    lock_path = tmp_path / "pipeline.lock"
    previous = subprocess.Popen([sys.executable, "-c", "pass"])
    previous.wait(timeout=10)
    lock_path.write_text(str(previous.pid), encoding="ascii")
    code = (
        "import os, sys; from pathlib import Path; "
        "from ripe_atlas_tcc.execution_lock import execution_lock; "
        "\nsys.stdin.read(1)"
        "\ntry:"
        "\n    with execution_lock(Path(sys.argv[1])):"
        "\n        print(f'acquired:{os.getpid()}', flush=True)"
        "\n        sys.stdin.read(1)"
        "\nexcept RuntimeError: print('blocked', flush=True)"
    )
    workers = []
    try:
        for _ in range(2):
            workers.append(subprocess.Popen(
                [sys.executable, "-u", "-c", code, str(lock_path)],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=subprocess.PIPE, text=True,
            ))
        for worker in workers:
            worker.stdin.write("s")
            worker.stdin.flush()
        answers = [worker.stdout.readline().strip() for worker in workers]
        assert sorted(answer.split(":")[0] for answer in answers) == ["acquired", "blocked"]
        winner_index = next(index for index, answer in enumerate(answers) if answer.startswith("acquired:"))
        winner = workers[winner_index]
        # A Windows venv launcher may have a different PID than its Python child.
        assert lock_owner(lock_path) == int(answers[winner_index].split(":")[1])
        for worker in workers:
            _, errors = worker.communicate(input="x" if worker is winner else None, timeout=10)
            assert worker.returncode == 0, errors
        assert not lock_path.exists()
    finally:
        for worker in workers:
            if worker.poll() is None:
                worker.kill()
            worker.communicate(timeout=10)

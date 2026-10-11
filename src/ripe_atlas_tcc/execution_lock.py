import errno
import os
from contextlib import contextmanager


def _process_is_running(pid):
    if os.name == "nt":
        return _windows_process_is_running(pid)

    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    return True


def _windows_process_is_running(pid):
    # os.kill(pid, 0) terminates a process on Windows. Only inspect its handle.
    import ctypes
    from ctypes import wintypes

    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.OpenProcess.argtypes = (wintypes.DWORD, wintypes.BOOL, wintypes.DWORD)
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.WaitForSingleObject.argtypes = (wintypes.HANDLE, wintypes.DWORD)
    kernel.WaitForSingleObject.restype = wintypes.DWORD
    kernel.CloseHandle.argtypes = (wintypes.HANDLE,)
    kernel.CloseHandle.restype = wintypes.BOOL

    handle = kernel.OpenProcess(0x00100000, False, pid)  # SYNCHRONIZE only
    if not handle:
        error = ctypes.get_last_error()
        if error == 87:  # ERROR_INVALID_PARAMETER: valid PID no longer exists
            return False
        raise ctypes.WinError(error)
    try:
        status = kernel.WaitForSingleObject(handle, 0)
        if status == 0:  # WAIT_OBJECT_0: process ended
            return False
        if status == 258:  # WAIT_TIMEOUT: process is still running
            return True
        raise ctypes.WinError(ctypes.get_last_error())
    finally:
        kernel.CloseHandle(handle)


@contextmanager
def _execution_guard(lock_path):
    # Keep this file: unlinking an OS-locked file can create competing locks
    # on different files. Its existence alone does not mean a process is active.
    guard_path = lock_path.with_name(f"{lock_path.name}.guard")
    descriptor = os.open(guard_path, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        try:
            if os.name == "nt":
                import msvcrt

                msvcrt.locking(descriptor, msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            if error.errno in (errno.EACCES, errno.EAGAIN, errno.EDEADLK):
                raise RuntimeError("Another pipeline process is already running.") from error
            raise
        yield
    finally:
        # Closing releases the native lock, including after an exception.
        # The OS also releases it if this process is forcibly terminated.
        os.close(descriptor)


def _remove_stale_lock(lock_path):
    try:
        pid = int(lock_path.read_text(encoding="ascii").strip())
        if not 0 < pid <= 0xFFFFFFFF:
            raise ValueError("Invalid process ID")
        running = _process_is_running(pid)
    except (OSError, ValueError, OverflowError) as error:
        raise RuntimeError(
            f"Cannot verify the owner of {lock_path}; the lock was preserved. "
            "Confirm that no pipeline process is running before removing it manually."
        ) from error
    if running:
        raise RuntimeError(f"Another pipeline process is already running (PID {pid}).")
    lock_path.unlink()


@contextmanager
def execution_lock(lock_path):
    lock_path.parent.mkdir(parents=True, exist_ok=True)

    with _execution_guard(lock_path):
        try:
            descriptor = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError:
            _remove_stale_lock(lock_path)
            descriptor = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)

        try:
            with os.fdopen(descriptor, "w", encoding="ascii") as lock_file:
                lock_file.write(str(os.getpid()))
            yield
        finally:
            lock_path.unlink(missing_ok=True)

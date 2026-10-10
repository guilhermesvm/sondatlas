import os
from contextlib import contextmanager


@contextmanager
def execution_lock(lock_path):
    lock_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        descriptor = os.open(
            lock_path,
            os.O_CREAT | os.O_EXCL | os.O_WRONLY,
        )
    except FileExistsError as error:
        raise RuntimeError(
            "Another pipeline process is already running. "
            f"If it ended unexpectedly, remove {lock_path}."
        ) from error

    try:
        os.write(descriptor, str(os.getpid()).encode("ascii"))
        os.close(descriptor)
        yield
    finally:
        lock_path.unlink(missing_ok=True)

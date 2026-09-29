"""Optional local diagnostics only. Never reads/writes mod state or controls Dota."""
import argparse
import ctypes
import hashlib
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import sys
import time
import uuid

CHUNK = 1024 * 1024
SEGMENT = 64 * CHUNK


def utc():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def open_source(path):
    if os.name != "nt":
        return path.open("rb")
    import msvcrt
    from ctypes import wintypes
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    create = kernel.CreateFileW
    create.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
                       ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
    create.restype = wintypes.HANDLE
    # Share deletion too: collecting must not prevent Dota/Minify rotating a log.
    handle = create(str(path), 0x80000000, 7, None, 3, 0x80, None)
    if handle == ctypes.c_void_p(-1).value:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        descriptor = msvcrt.open_osfhandle(handle, os.O_RDONLY | os.O_BINARY)
    except Exception:
        close = kernel.CloseHandle
        close.argtypes = [wintypes.HANDLE]
        close(handle)
        raise
    return os.fdopen(descriptor, "rb")


def append_durable(path, data):
    with path.open("ab", buffering=0) as output:
        start = output.tell()
        try:
            remaining = memoryview(data)
            while remaining:
                written = output.write(remaining)
                if not written:
                    raise OSError("Archive write made no progress")
                remaining = remaining[written:]
            os.fsync(output.fileno())
        except OSError:
            output.truncate(start)
            raise


class Tail:
    def __init__(self, source, archive):
        self.source, self.archive = Path(source), Path(archive)
        self.identity = None
        self.offset = 0
        self.prefix = self.anchor = b""
        self.output = None
        self.output_size = 0
        self.reason = "collector-start"
        self.error = None

    def poll(self):
        with open_source(self.source) as source:
            info = os.fstat(source.fileno())
            identity = (info.st_dev, info.st_ino, getattr(info, "st_birthtime_ns", 0))
            prefix = source.read(len(self.prefix))
            source.seek(max(0, self.offset - len(self.anchor)))
            anchor = source.read(len(self.anchor))
            if self.identity is not None and (identity != self.identity or
                    info.st_size < self.offset or prefix != self.prefix or anchor != self.anchor):
                self.offset = 0
                self.prefix = self.anchor = b""
                self.output = None
                self.reason = "source-replaced-or-rewritten"
            self.identity = identity
            source.seek(self.offset)
            room = SEGMENT - self.output_size if self.output else SEGMENT
            data = source.read(min(CHUNK, room))
        if not data:
            return
        if self.output is None:
            self.archive.mkdir(parents=True, exist_ok=True)
            tag = hashlib.sha256(str(self.source).encode("utf-8")).hexdigest()[:12]
            name = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()) + "-" + tag + "-" + uuid.uuid4().hex[:12] + ".log"
            output = self.archive / name
            output.touch(exist_ok=False)
            metadata = {"at": utc(), "source": str(self.source), "archive": name,
                        "source_offset": self.offset, "reason": self.reason}
            append_durable(self.archive / "index.jsonl", (json.dumps(metadata) + "\n").encode("utf-8"))
            self.output, self.output_size = output, 0
        append_durable(self.output, data)
        self.offset += len(data)
        self.output_size += len(data)
        self.prefix = (self.prefix + data)[:512]
        self.anchor = (self.anchor + data)[-4096:]
        if self.output_size == SEGMENT:
            self.output = None
            self.reason = "segment-limit"

    def status(self):
        return {"source": str(self.source), "copied_bytes": self.offset,
                "archive": str(self.output) if self.output else None, "error": self.error}


def lock_instance(path):
    lock = path.open("a+b")
    if lock.tell() == 0:
        lock.write(b"0")
        lock.flush()
    lock.seek(0)
    try:
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        lock.close()
        return None
    return lock


def write_status(root, payload):
    temporary = root / "status.tmp"
    temporary.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    os.replace(temporary, root / "status.json")


def collect(config_path):
    config = json.loads(config_path.read_text(encoding="utf-8-sig"))
    root = config_path.parent
    watches = config["watch"]
    for watch in watches:
        if not Path(watch["directory"]).is_absolute():
            raise ValueError("Watch directories must be absolute")
        if Path(watch["directory"]).resolve() in (root, root / "archives"):
            raise ValueError("Collector must not watch its own output directory")
        if any("/" in pattern or "\\" in pattern for pattern in watch["patterns"]):
            raise ValueError("Only nonrecursive filename patterns are supported")
    lock = lock_instance(root / "collector.lock")
    if lock is None:
        return
    with lock:
        logger = logging.getLogger("collector")
        logger.setLevel(logging.INFO)
        handler = RotatingFileHandler(root / "collector.log", maxBytes=1024 * 1024, backupCount=2, encoding="utf-8")
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
        logger.addHandler(handler)
        tails, last_status, loop_error, watch_errors = {}, 0, None, {}
        started = utc()
        logger.info("Started pid=%s; development-only; no uploads or mod state writes", os.getpid())
        try:
            while not (root / "stop.request").exists():
                try:
                    refresh = time.monotonic() - last_status >= 2
                    if refresh:
                        last_status = time.monotonic()
                        for watch in watches:
                            directory = Path(watch["directory"])
                            try:
                                for pattern in watch["patterns"]:
                                    for path in directory.glob(pattern):
                                        if path.is_file() and str(path) not in tails:
                                            tails[str(path)] = Tail(path, root / "archives")
                                watch_errors.pop(str(directory), None)
                            except OSError as error:
                                if watch_errors.get(str(directory)) != str(error):
                                    logger.warning("Discovery failed for %s: %s", directory, error)
                                watch_errors[str(directory)] = str(error)
                    for tail in tails.values():
                        try:
                            tail.poll()
                            if tail.error:
                                logger.info("Source recovered: %s", tail.source)
                            tail.error = None
                        except OSError as error:
                            message = str(error)
                            if message != tail.error:
                                logger.warning("%s: %s", tail.source, message)
                            tail.error = message
                    if refresh:
                        write_status(root, {"pid": os.getpid(), "started": started, "heartbeat": utc(),
                                            "state": "running", "watch": watches, "watch_errors": watch_errors,
                                            "sources": [tail.status() for tail in tails.values()]})
                    loop_error = None
                except OSError as error:
                    if str(error) != loop_error:
                        logger.exception("Collector filesystem error; will retry")
                    loop_error = str(error)
                # ponytail: polling cannot recover bytes erased entirely between polls.
                time.sleep(0.25)
        finally:
            logger.info("Stopped")
            write_status(root, {"pid": os.getpid(), "started": started, "heartbeat": utc(),
                                "state": "stopped", "sources": [tail.status() for tail in tails.values()]})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    args = parser.parse_args()
    try:
        collect(args.config.resolve())
    except Exception:
        logging.exception("Collector failed")
        sys.exit(1)

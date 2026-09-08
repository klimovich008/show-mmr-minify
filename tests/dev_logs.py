"""Run with python -B tests/dev_logs.py. Uses temporary files, never Dota files."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/collect_dev_logs.py"
spec = importlib.util.spec_from_file_location("collector", SCRIPT)
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


def entries(archive):
    return [json.loads(line) for line in (archive / "index.jsonl").read_text().splitlines()]


def eventually(check):
    deadline = time.monotonic() + 12
    while time.monotonic() < deadline:
        if check():
            return
        time.sleep(0.1)
    raise AssertionError("Collector did not reach expected state")


with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary)
    source, archive = root / "console.log", root / "archive"
    original = b"header\r\npartial UTF8: \xe2\x82"
    source.write_bytes(original)
    tail = collector.Tail(source, archive)
    tail.poll()
    first = tail.output
    assert first.read_bytes() == original
    with source.open("ab") as stream:
        stream.write(b"\xac\r\n\x00more data")
    tail.poll()
    assert first.read_bytes() == source.read_bytes(), "Preserve raw bytes, including split UTF-8"
    before = first.read_bytes()
    source.write_bytes(b"new\r\n")
    tail.poll()
    assert tail.output != first and first.read_bytes() == before
    assert tail.output.read_bytes() == b"new\r\n"

    # Same inode, same prefix, and regrowth beyond the old offset between polls.
    source.write_bytes(b"x" * 600 + b"old" * 2000)
    tail.poll()
    second = tail.output
    source.write_bytes(b"x" * 600 + b"new" * 3000)
    tail.poll()
    assert tail.output != second
    assert tail.output.read_bytes() == source.read_bytes()

    replacement = root / "replacement.tmp"
    replacement.write_bytes(b"replacement")
    with collector.open_source(source) as opened:
        os.rename(source, root / "rotated.log")
        os.replace(replacement, source)
        assert opened.read(3) == b"xxx", "Source handle must allow replacement on Windows"
    tail.poll()
    assert tail.output.read_bytes() == b"replacement"
    source.unlink()
    try:
        tail.poll()
        raise AssertionError("Expected missing source")
    except OSError:
        pass
    source.write_bytes(b"returned")
    tail.poll()
    assert tail.output.read_bytes() == b"returned"

    source.write_bytes(bytes(range(128)))
    split = root / "split"
    tail = collector.Tail(source, split)
    with patch.object(collector, "CHUNK", 7), patch.object(collector, "SEGMENT", 21):
        while tail.offset < source.stat().st_size:
            tail.poll()
    index = entries(split)
    assert b"".join((split / item["archive"]).read_bytes() for item in index) == source.read_bytes()
    assert [item["source_offset"] for item in index] == list(range(0, 128, 21))

    failed = collector.Tail(source, root / "failed")
    real_append = collector.append_durable

    def fail_data(path, data):
        if path.suffix == ".log":
            raise OSError("test disk failure")
        real_append(path, data)

    with patch.object(collector, "append_durable", fail_data):
        try:
            failed.poll()
            raise AssertionError("Expected failed archive write")
        except OSError:
            pass
    assert failed.offset == 0, "Failed writes must never acknowledge source bytes"
    failed.poll()
    assert failed.output.read_bytes() == source.read_bytes()

    install, logs = root / "install", root / "watched"
    install.mkdir()
    logs.mkdir()
    (logs / "console.log").write_bytes(b"worker-one\r\n")
    (logs / "private.txt").write_text("not selected")
    config = install / "config.json"
    config.write_text(json.dumps({"watch": [{"directory": str(logs), "patterns": ["*.log"]}]}))
    command = [sys.executable, "-B", str(SCRIPT), "--config", str(config)]
    worker = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        def captured(data):
            return any(data in file.read_bytes() for file in (install / "archives").glob("*.log"))

        eventually(lambda: captured(b"worker-one\r\n"))
        duplicate = subprocess.run(command, capture_output=True, timeout=5)
        assert duplicate.returncode == 0 and worker.poll() is None
        with (logs / "console.log").open("ab") as stream:
            stream.write(b"worker-two\r\n")
        eventually(lambda: captured(b"worker-two\r\n"))
        (logs / "build.log").write_bytes(b"newly-discovered\r\n")
        eventually(lambda: captured(b"newly-discovered\r\n"))
        assert not captured(b"not selected")
        (logs / "console.log").write_bytes(b"restarted\r\n")
        eventually(lambda: captured(b"restarted\r\n"))
        (install / "stop.request").touch()
        stdout, stderr = worker.communicate(timeout=8)
        assert worker.returncode == 0, stderr.decode(errors="replace")
        status = json.loads((install / "status.json").read_text())
        assert status["state"] == "stopped" and len(status["sources"]) == 2
    finally:
        if worker.poll() is None:
            worker.terminate()
            worker.communicate(timeout=5)

print("Development log collector checks passed (raw bytes, rotation, retries, segments, sharing, singleton, lifecycle)")

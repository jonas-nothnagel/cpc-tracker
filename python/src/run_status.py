"""Status files that a detached job writes for the web server to read.

The server polls these files while a document is read or an analysis runs.
Each write replaces the file whole, so a reader never sees half of one, and
a heartbeat rewrites it every 15 seconds with the job's process id and the
server's boot id. A file whose heartbeat stops tells the server the job is
gone (a restart, a deploy), so it can start it again.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def write_json_atomic(path: Path, data: Any) -> None:
    """Write JSON to a temporary file beside `path`, then move it into place."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.{threading.get_ident()}.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    os.replace(tmp, path)


class StatusFile:
    """One job's status file: whole writes, throttled updates, a heartbeat."""

    def __init__(self, path: Path, *, heartbeat_s: float = 15.0, min_interval_s: float = 2.0) -> None:
        self.path = Path(path)
        self.heartbeat_s = heartbeat_s
        self.min_interval_s = min_interval_s
        self._payload: dict[str, Any] = {}
        self._lock = threading.Lock()
        self._last_write = 0.0
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def _write_locked(self) -> None:
        self._payload["heartbeatAt"] = _now()
        self._payload["pid"] = os.getpid()
        self._payload["bootId"] = os.environ.get("CPC_BOOT_ID", "")
        write_json_atomic(self.path, self._payload)
        self._last_write = time.monotonic()

    @property
    def payload(self) -> dict[str, Any]:
        with self._lock:
            return dict(self._payload)

    def write(self, payload: dict[str, Any]) -> None:
        """Replace the status with `payload`, written at once."""
        with self._lock:
            self._payload = dict(payload)
            self._write_locked()

    def update(self, force: bool = False, **fields: Any) -> None:
        """Merge `fields` into the status; written at most every
        `min_interval_s` (the heartbeat carries the rest) unless `force`."""
        with self._lock:
            self._payload.update(fields)
            if force or time.monotonic() - self._last_write >= self.min_interval_s:
                self._write_locked()

    def start_heartbeat(self) -> None:
        if self._thread is not None:
            return
        self._stop.clear()

        def beat() -> None:
            while not self._stop.wait(self.heartbeat_s):
                with self._lock:
                    if not self._payload:
                        continue
                    try:
                        self._write_locked()
                    except OSError as e:
                        # A network share can fail one write; the next beat
                        # tries again rather than letting the run look gone.
                        logger.warning(f"Status heartbeat write failed: {e}")

        self._thread = threading.Thread(target=beat, name="status-heartbeat", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=2)
            self._thread = None

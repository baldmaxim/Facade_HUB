"""Disk-based VOR result storage — zero RAM, survives restarts.

Stores VOR pricing results as JSON files so users can correct
individual positions without re-running the full pipeline.

Files are cleaned up by the existing periodic cleanup in main.py.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from dataclasses import asdict
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

_STORE_DIR = Path(__file__).parent.parent.parent / "data" / "vor_sessions"

# Max age before cleanup (24 hours)
VOR_SESSION_TTL = 24 * 3600


def _ensure_dir() -> Path:
    _STORE_DIR.mkdir(parents=True, exist_ok=True)
    return _STORE_DIR


def save_vor_result(device_id: str, result: Any) -> str:
    """Save VOR result to disk. Returns vor_id for later retrieval."""
    vor_id = uuid.uuid4().hex[:12]
    path = _ensure_dir() / f"{device_id}_{vor_id}.json"

    # Convert dataclasses to dicts, handle Enum values
    data = _serialize(result)
    data["_meta"] = {
        "device_id": device_id,
        "vor_id": vor_id,
        "created_at": time.time(),
    }

    path.write_text(json.dumps(data, ensure_ascii=False, default=str), encoding="utf-8")
    logger.info("VOR result saved: %s (%d items)", path.name, len(data.get("items", [])))
    return vor_id


def load_vor_result(device_id: str, vor_id: Optional[str] = None) -> Optional[dict[str, Any]]:
    """Load VOR result from disk.

    If vor_id is None, loads the most recent VOR for this device.
    """
    store = _ensure_dir()

    if vor_id:
        path = store / f"{device_id}_{vor_id}.json"
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
        return None

    # Find most recent for this device
    candidates = sorted(
        store.glob(f"{device_id}_*.json"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if not candidates:
        return None
    return json.loads(candidates[0].read_text(encoding="utf-8"))


def update_vor_result(device_id: str, vor_id: str, data: dict[str, Any]) -> bool:
    """Overwrite VOR result on disk after correction."""
    path = _ensure_dir() / f"{device_id}_{vor_id}.json"
    if not path.exists():
        return False
    path.write_text(json.dumps(data, ensure_ascii=False, default=str), encoding="utf-8")
    logger.info("VOR result updated: %s", path.name)
    return True


def cleanup_old_sessions() -> int:
    """Remove VOR session files older than VOR_SESSION_TTL."""
    store = _ensure_dir()
    cutoff = time.time() - VOR_SESSION_TTL
    removed = 0
    for f in store.glob("*.json"):
        try:
            if f.stat().st_mtime < cutoff:
                f.unlink()
                removed += 1
        except OSError:
            pass
    return removed


def _serialize(obj: Any) -> dict:
    """Convert VorResult (dataclass with Enums) to JSON-safe dict."""
    from dataclasses import asdict, fields, is_dataclass
    from enum import Enum

    if is_dataclass(obj):
        result = {}
        for f in fields(obj):
            val = getattr(obj, f.name)
            result[f.name] = _serialize_value(val)
        return result
    return {"_raw": str(obj)}


def _serialize_value(val: Any) -> Any:
    """Recursively serialize a value to JSON-safe types."""
    from dataclasses import fields, is_dataclass
    from enum import Enum

    if val is None or isinstance(val, (str, int, float, bool)):
        return val
    if isinstance(val, Enum):
        return val.value
    if is_dataclass(val):
        result = {}
        for f in fields(val):
            result[f.name] = _serialize_value(getattr(val, f.name))
        return result
    if isinstance(val, list):
        return [_serialize_value(v) for v in val]
    if isinstance(val, dict):
        return {str(k): _serialize_value(v) for k, v in val.items()}
    return str(val)

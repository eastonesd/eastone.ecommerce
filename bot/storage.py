"""資料存成 JSON，直接放在 dashboard/data/，由 GitHub Pages 讀取。"""
from __future__ import annotations

import json
from pathlib import Path

from .config import DATA_DIR

FILES = ("posts", "conversions", "candidates", "meta")


def _path(name: str) -> Path:
    return DATA_DIR / f"{name}.json"


def load(name: str, default=None):
    p = _path(name)
    if not p.exists():
        return [] if default is None else default
    return json.loads(p.read_text(encoding="utf-8"))


def save(name: str, data) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    _path(name).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

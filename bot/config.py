import os
from pathlib import Path

import yaml

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:  # pragma: no cover
    pass

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "dashboard" / "data"


def load_config(path: Path | None = None) -> dict:
    with open(path or ROOT / "config.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def is_dry_run() -> bool:
    """沒有金鑰時強制 dry-run，避免半套設定誤發文。"""
    if env("DRY_RUN", "1") == "1":
        return True
    required = ["SHOPEE_APP_ID", "SHOPEE_SECRET", "THREADS_ACCESS_TOKEN"]
    return any(not env(k) for k in required)

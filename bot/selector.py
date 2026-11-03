"""選品 + 利潤規劃：過濾 → 估算預期佣金 → 綜合評分 → 排序。"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone


def passes_filters(p: dict, rules: dict) -> bool:
    lo, hi = rules["price_range"]
    return (
        p["commission_rate"] >= rules["min_commission_rate"]
        and p["rating"] >= rules["min_rating"]
        and p["sales"] >= rules["min_sales"]
        and lo <= p["price"] <= hi
    )


def expected_commission(p: dict, profit: dict, views: float | None = None) -> float:
    """單篇貼文預期佣金 = 曝光 × 點擊率 × 轉換率 × 每單佣金"""
    views = views or profit["est_views_per_post"]
    per_order = p["commission"] or p["price"] * p["commission_rate"]
    return views * profit["est_click_rate"] * profit["est_conversion_rate"] * per_order


def score(p: dict, profit: dict, views: float | None = None) -> dict:
    w = profit["weights"]
    ec = expected_commission(p, profit, views)
    parts = {
        "expected_commission": min(ec / 50, 1.0),                 # NT$50/篇 視為滿分
        "sales_momentum": min(math.log10(p["sales"] + 1) / 4, 1.0),  # 1 萬銷量滿分
        "rating": max(0.0, (p["rating"] - 4.0)),                   # 4.0→0, 5.0→1
        "discount": min(p.get("discount", 0) / 0.5, 1.0),
    }
    total = sum(parts[k] * w[k] for k in w)
    return {**p, "expected_commission": round(ec, 2), "score": round(total, 4)}


def recently_posted(history: list[dict], days: int) -> set[str]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    return {
        h["item_id"] for h in history
        if datetime.fromisoformat(h["posted_at"]) >= cutoff
    }


def pick(candidates: list[dict], cfg: dict, history: list[dict], avg_views: float | None = None) -> list[dict]:
    sel, prof, post = cfg["selection"], cfg["profit"], cfg["posting"]
    skip = recently_posted(history, sel["repost_cooldown_days"])
    seen, ranked = set(), []
    for p in candidates:
        if p["item_id"] in skip or p["item_id"] in seen or not passes_filters(p, sel):
            continue
        seen.add(p["item_id"])
        ranked.append(score(p, prof, avg_views))
    ranked.sort(key=lambda x: x["score"], reverse=True)

    # 同關鍵字最多一篇，避免整天推同類
    picked, used_kw = [], set()
    for p in ranked:
        kw = p.get("keyword")
        if kw in used_kw:
            continue
        picked.append(p)
        used_kw.add(kw)
        if len(picked) >= post["posts_per_run"]:
            break
    return picked

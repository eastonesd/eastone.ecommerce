"""產生示範資料到 dashboard/data/demo/（正式資料為空時儀表板會顯示這份）。

  python -m bot.demo
"""
import random
from datetime import timedelta

from . import copywriter, selector, storage
from .config import DATA_DIR, load_config
from .main import _demo_conversions, now
from .shopee_affiliate import ShopeeAffiliate
from .threads_client import Threads


def build(days: int = 14, per_day: int = 2):
    cfg = load_config()
    shopee, threads = ShopeeAffiliate("", "", True), Threads("", dry_run=True)
    pool = [{**p, "keyword": kw} for kw in cfg["selection"]["keywords"]
            for pg in (1, 2, 3) for p in shopee.search_products(kw, pg)]
    ranked = sorted((selector.score(p, cfg["profit"]) for p in pool
                     if selector.passes_filters(p, cfg["selection"])), key=lambda x: -x["score"])
    rnd, posts = random.Random(42), []
    for d in range(days, 0, -1):
        for i in range(per_day):
            p = ranked[(len(posts) * 3) % len(ranked)]
            t = now() - timedelta(days=d, hours=rnd.randint(-3, 3))
            sub = f"t{t:%y%m%d%H%M}{i}"
            pid = f"demo-{sub}"
            posts.append({
                "post_id": pid, "reply_id": None, "sub_id": sub, "permalink": "",
                "item_id": p["item_id"], "name": p["name"], "keyword": p["keyword"],
                "price": p["price"], "commission_rate": p["commission_rate"],
                "expected_commission": p["expected_commission"], "score": p["score"],
                "short_link": "", "text": copywriter.write_post(p, {**cfg, "copywriter": {"provider": "template"}}),
                "posted_at": t.isoformat(), "dry_run": True,
                "metrics": threads.insights(pid), "orders": 0, "commission": 0.0,
            })
    convs = _demo_conversions(posts)
    by_sub = {p["sub_id"]: p for p in posts}
    for c in convs:
        p = by_sub[c["sub_ids"][0]]
        p["orders"] += 1
        p["commission"] = round(p["commission"] + c["commission"], 2)

    out = DATA_DIR / "demo"
    out.mkdir(parents=True, exist_ok=True)
    storage.DATA_DIR = out  # 改寫入 demo 子目錄
    s = storage
    s.save("posts", posts)
    s.save("conversions", convs)
    s.save("candidates", {"updated_at": now().isoformat(), "pool_size": len(pool), "top": ranked[:30]})
    s.save("meta", {"updated_at": now().isoformat(), "mode": "demo", "total_posts": len(posts),
                    "total_commission": round(sum(c["commission"] for c in convs), 2),
                    "total_orders": len(convs)})
    print(f"demo: {len(posts)} posts, {len(convs)} conversions → {out}")


if __name__ == "__main__":
    build()

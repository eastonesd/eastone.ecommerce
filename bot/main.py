"""CLI 入口

  python -m bot.main select   # 只選品，輸出候選清單
  python -m bot.main post     # 選品 → 寫文 → 發 Threads → 留言貼連結
  python -m bot.main sync     # 更新貼文成效 + 蝦皮佣金報表
  python -m bot.main run      # sync + post（排程用）
"""
from __future__ import annotations

import argparse
import random
import time
from datetime import datetime, timedelta, timezone

from . import copywriter, selector, storage
from .config import env, is_dry_run, load_config
from .shopee_affiliate import ShopeeAffiliate
from .threads_client import Threads

TZ = timezone(timedelta(hours=8))


def now() -> datetime:
    return datetime.now(timezone.utc)


def clients(dry: bool):
    shopee = ShopeeAffiliate(env("SHOPEE_APP_ID"), env("SHOPEE_SECRET"), dry_run=dry)
    threads = Threads(env("THREADS_ACCESS_TOKEN"), env("THREADS_USER_ID", "me"), dry_run=dry)
    return shopee, threads


def avg_views(posts: list[dict]) -> float | None:
    v = [p["metrics"]["views"] for p in posts[-30:] if p.get("metrics", {}).get("views")]
    return sum(v) / len(v) if len(v) >= 5 else None  # 樣本夠才用真實數據取代預設值


# ── 選品 ───────────────────────────────────────────────────
def cmd_select(cfg, shopee, posts) -> list[dict]:
    sel = cfg["selection"]
    pool = []
    for kw in sel["keywords"]:
        for page in range(1, sel["pages_per_keyword"] + 1):
            try:
                for p in shopee.search_products(kw, page=page):
                    pool.append({**p, "keyword": kw})
            except Exception as e:
                print(f"[select] {kw} p{page} 失敗：{e}")
    picked = selector.pick(pool, cfg, posts, avg_views(posts))
    top = sorted((selector.score(p, cfg["profit"], avg_views(posts)) for p in pool
                  if selector.passes_filters(p, sel)), key=lambda x: -x["score"])[:30]
    storage.save("candidates", {"updated_at": now().isoformat(), "pool_size": len(pool), "top": top})
    print(f"[select] 掃描 {len(pool)} 件，合格 {len(top)}+，本次挑選 {len(picked)} 件")
    return picked


# ── 發文 ───────────────────────────────────────────────────
def cmd_post(cfg, shopee, threads, posts, dry):
    picked = cmd_select(cfg, shopee, posts)
    for i, p in enumerate(picked):
        sub_id = f"t{now().astimezone(TZ):%y%m%d%H%M}{i}"
        link = shopee.short_link(p["link"], [sub_id, "threads"])
        text = copywriter.write_post(p, cfg)
        try:
            if cfg["posting"]["link_in_reply"]:
                post_id = threads.publish_text(text)
                reply_id = threads.publish_text(copywriter.write_reply(link), reply_to=post_id)
            else:
                post_id = threads.publish_text(f"{text}\n{link}")
                reply_id = None
        except Exception as e:
            print(f"[post] 發文失敗 {p['name']}：{e}")
            continue
        posts.append({
            "post_id": post_id, "reply_id": reply_id, "sub_id": sub_id,
            "permalink": threads.permalink(post_id),
            "item_id": p["item_id"], "name": p["name"], "keyword": p["keyword"],
            "price": p["price"], "commission_rate": p["commission_rate"],
            "expected_commission": p["expected_commission"], "score": p["score"],
            "short_link": link, "text": text, "posted_at": now().isoformat(),
            "dry_run": dry, "metrics": {}, "orders": 0, "commission": 0.0,
        })
        time.sleep(0 if dry else 20)  # 連發間隔，降低被判定洗版的風險
    storage.save("posts", posts)


# ── 同步成效 ───────────────────────────────────────────────
def cmd_sync(cfg, shopee, threads, posts, dry):
    cutoff = now() - timedelta(days=30)
    for p in posts:
        if datetime.fromisoformat(p["posted_at"]) >= cutoff:
            try:
                p["metrics"] = threads.insights(p["post_id"])
            except Exception as e:
                print(f"[sync] insights {p['post_id']} 失敗：{e}")

    convs = {c["conversion_id"]: c for c in storage.load("conversions")}
    fresh = _demo_conversions(posts) if dry else shopee.conversions(
        int(cutoff.timestamp()), int(now().timestamp()))
    for c in fresh:
        convs[c["conversion_id"]] = c
    conv_list = sorted(convs.values(), key=lambda c: c["purchase_time"] or 0)

    by_sub = {p["sub_id"]: p for p in posts}
    for p in posts:
        p["orders"], p["commission"] = 0, 0.0
    for c in conv_list:
        for s in c["sub_ids"]:
            if s in by_sub:
                by_sub[s]["orders"] += 1
                by_sub[s]["commission"] = round(by_sub[s]["commission"] + c["commission"], 2)
                break

    storage.save("posts", posts)
    storage.save("conversions", conv_list)
    storage.save("meta", {
        "updated_at": now().isoformat(),
        "mode": "demo" if dry else "live",
        "total_posts": len(posts),
        "total_commission": round(sum(c["commission"] for c in conv_list), 2),
        "total_orders": len(conv_list),
    })
    print(f"[sync] 貼文 {len(posts)}、轉換 {len(conv_list)}")


def _demo_conversions(posts):
    """dry-run 時依貼文曝光模擬訂單，讓儀表板有東西看。"""
    out = []
    for p in posts:
        rnd = random.Random(p["sub_id"])
        views = p.get("metrics", {}).get("views", 0)
        n = sum(rnd.random() < 0.012 * 0.035 * 3 for _ in range(views // 10))
        base = datetime.fromisoformat(p["posted_at"])
        for k in range(n):
            t = min(base + timedelta(hours=rnd.uniform(1, 72)), now())
            out.append({
                "conversion_id": f"demo-{p['sub_id']}-{k}",
                "purchase_time": int(t.timestamp()),
                "commission": round(p["price"] * p["commission_rate"] * rnd.uniform(0.8, 1.5), 1),
                "sub_ids": [p["sub_id"], "threads"], "items": [],
            })
    return out


def main():
    ap = argparse.ArgumentParser(description="shopee.robot")
    ap.add_argument("cmd", choices=["select", "post", "sync", "run"])
    args = ap.parse_args()

    cfg, dry = load_config(), is_dry_run()
    print(f"[shopee.robot] mode={'DRY-RUN' if dry else 'LIVE'}")
    shopee, threads = clients(dry)
    posts = storage.load("posts")

    if args.cmd == "select":
        for p in cmd_select(cfg, shopee, posts):
            print(f"  {p['score']:.3f}  NT${p['expected_commission']:>6}/篇  {p['name']}")
    elif args.cmd == "post":
        cmd_post(cfg, shopee, threads, posts, dry)
    elif args.cmd == "sync":
        cmd_sync(cfg, shopee, threads, posts, dry)
    else:
        cmd_sync(cfg, shopee, threads, posts, dry)
        cmd_post(cfg, shopee, threads, posts, dry)
        cmd_sync(cfg, shopee, threads, posts, dry)

    if not dry and (new := threads.refresh_token()) and new != env("THREADS_ACCESS_TOKEN"):
        print("[threads] token 已延長效期（同一 token 值通常不變）")


if __name__ == "__main__":
    main()

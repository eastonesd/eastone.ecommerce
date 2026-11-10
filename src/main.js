/**
 * node src/main.js select | post | sync | run
 *
 * 模式由金鑰自動決定（見 config.js detectModes）：
 *   有蝦皮 API → 自動選品；沒有 → 用 queue.yaml 手動佇列
 *   有 Threads token 且 DRY_RUN=0 → 真的發文；否則 → 產生草稿到儀表板
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, env, loadConfig, loadQueue, detectModes } from "./config.js";
import * as store from "./storage.js";
import { pick, rank } from "./selector.js";
import { writePost, writeReply } from "./copywriter.js";
import { ShopeeApi, QueueSource, DemoSource } from "./shopee.js";
import { Threads } from "./threads.js";

const iso = () => new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = (d = new Date()) =>
  new Date(d.getTime() + 8 * 36e5).toISOString().replace(/\D/g, "").slice(2, 12); // 台北時間 yyMMddHHmm

export function makeSource(mode) {
  if (mode === "api") return new ShopeeApi(env("SHOPEE_APP_ID"), env("SHOPEE_SECRET"));
  if (mode === "queue") return new QueueSource(loadQueue());
  return new DemoSource();
}

function avgViews(posts) {
  const v = posts.slice(-30).map((p) => p.metrics?.views).filter(Boolean);
  return v.length >= 5 ? v.reduce((a, b) => a + b, 0) / v.length : undefined; // 樣本夠才取代預設值
}

// ── 選品 ─────────────────────────────────────────────
export async function select(cfg, source, history) {
  let pool = [];
  if (source instanceof QueueSource) pool = await source.all();
  else
    for (const kw of cfg.selection.keywords)
      for (let page = 1; page <= cfg.selection.pages_per_keyword; page++)
        try {
          pool.push(...(await source.searchProducts(kw, page)).map((p) => ({ ...p, keyword: kw })));
        } catch (e) {
          console.log(`[select] ${kw} p${page} 失敗：${e.message}`);
        }
  const views = avgViews(history);
  const picked = pick(pool, cfg, history, views);
  const top = rank(pool, cfg, views).slice(0, 30);
  store.save("candidates", { updated_at: iso(), pool_size: pool.length, top });
  console.log(`[select] 掃描 ${pool.length} 件、合格 ${top.length}${top.length === 30 ? "+" : ""}，本次挑 ${picked.length} 件`);
  return picked;
}

// ── 發文 / 草稿 ──────────────────────────────────────
export async function post(cfg, modes, source, threads) {
  const posts = store.load("posts");
  const drafts = store.load("drafts");
  const picked = await select(cfg, source, [...posts, ...drafts.map((d) => ({ ...d, posted_at: d.created_at }))]);

  for (const [i, p] of picked.entries()) {
    const sub_id = `t${stamp()}${i}`;
    const link = await source.shortLink(p.link, [sub_id, "threads"]);
    const text = await writePost(p, cfg);
    const reply = writeReply(link);
    const base = {
      sub_id, item_id: p.item_id, name: p.name, keyword: p.keyword, price: p.price,
      commission_rate: p.commission_rate, expected_commission: p.expected_commission,
      score: p.score, short_link: link, text,
    };

    if (modes.threads === "draft") {
      drafts.push({ ...base, reply, created_at: iso(), status: "pending" });
      console.log(`[draft] ${p.name}`);
      continue;
    }
    try {
      let post_id, reply_id = null;
      if (cfg.posting.link_in_reply) {
        post_id = await threads.publishText(text);
        reply_id = await threads.publishText(reply, post_id);
      } else post_id = await threads.publishText(`${text}\n${link}`);
      posts.push({
        ...base, post_id, reply_id, permalink: await threads.permalink(post_id),
        posted_at: iso(), metrics: {}, orders: 0, commission: 0,
      });
      console.log(`[post] ✓ ${p.name}`);
      await sleep(20_000); // 連發間隔，降低被判定洗版的風險
    } catch (e) {
      console.log(`[post] ✗ ${p.name}：${e.message}`);
    }
  }
  store.save("posts", posts);
  store.save("drafts", drafts.slice(-60));
}

// ── 同步成效 ─────────────────────────────────────────
export async function sync(cfg, modes, source, threads) {
  const posts = store.load("posts");
  const cutoff = Date.now() - 30 * 864e5;
  if (threads)
    for (const p of posts)
      if (Date.parse(p.posted_at) >= cutoff)
        try {
          p.metrics = await threads.insights(p.post_id);
        } catch (e) {
          console.log(`[sync] insights ${p.post_id}：${e.message}`);
        }

  const convs = new Map(store.load("conversions").map((c) => [c.conversion_id, c]));
  try {
    for (const c of await source.conversions(Math.floor(cutoff / 1000), Math.floor(Date.now() / 1000)))
      convs.set(c.conversion_id, c);
  } catch (e) {
    console.log(`[sync] 轉換報表：${e.message}`);
  }
  const list = [...convs.values()].sort((a, b) => a.purchase_time - b.purchase_time);
  attribute(posts, list);

  store.save("posts", posts);
  store.save("conversions", list);
  store.save("meta", {
    updated_at: iso(), modes,
    total_posts: posts.length,
    total_drafts: store.load("drafts").length,
    total_orders: list.length,
    total_commission: Math.round(list.reduce((a, c) => a + c.commission, 0) * 100) / 100,
  });
  console.log(`[sync] 貼文 ${posts.length}、轉換 ${list.length}`);
}

/** 依 subId 把每筆佣金歸到對應貼文 */
export function attribute(posts, convs) {
  const bySub = new Map(posts.map((p) => [p.sub_id, p]));
  for (const p of posts) Object.assign(p, { orders: 0, commission: 0 });
  for (const c of convs) {
    const p = c.sub_ids.map((s) => bySub.get(s)).find(Boolean);
    if (p) (p.orders += 1), (p.commission = Math.round((p.commission + c.commission) * 100) / 100);
  }
}

async function main() {
  const cmd = process.argv[2] || "run";
  const cfg = loadConfig();
  const modes = detectModes();
  console.log(`[shopee.robot] 選品=${modes.shopee}　發布=${modes.threads}`);

  const source = makeSource(modes.shopee);
  const threads = env("THREADS_ACCESS_TOKEN") ? new Threads(env("THREADS_ACCESS_TOKEN")) : null;

  if (modes.shopee === "demo" && cmd !== "select") {
    console.log("尚未設定蝦皮 API，queue.yaml 也是空的 → 請先在 queue.yaml 加入商品。（看示範：npm run demo）");
    return;
  }
  if (cmd === "select") {
    for (const p of await select(cfg, source, store.load("posts")))
      console.log(`  ${p.score.toFixed(3)}  NT$${p.expected_commission}/篇  ${p.name}`);
  } else if (cmd === "post") await post(cfg, modes, source, threads);
  else if (cmd === "sync") await sync(cfg, modes, source, threads);
  else {
    await sync(cfg, modes, source, threads);
    await post(cfg, modes, source, threads);
    await sync(cfg, modes, source, threads);
  }

  // 延長 Threads token，交給 workflow 寫回 GitHub Secret
  if (threads) {
    const fresh = await threads.refreshToken().catch(() => null);
    if (fresh) writeFileSync(join(ROOT, ".threads-token"), fresh);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => (console.error(e), process.exit(1)));

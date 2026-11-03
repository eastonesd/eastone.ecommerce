/** 產生示範資料到 dashboard/data/demo/（正式資料為空時，儀表板顯示這份）。npm run demo */
import { join } from "node:path";
import { DATA_DIR, loadConfig } from "./config.js";
import * as store from "./storage.js";
import { rank } from "./selector.js";
import { writePost, writeReply } from "./copywriter.js";
import { DemoSource } from "./shopee.js";
import { attribute } from "./main.js";
import { seeded } from "./rand.js";

const cfg = loadConfig();
const local = { ...cfg, copywriter: { provider: "template" } };
const src = new DemoSource();
const pool = [];
for (const kw of cfg.selection.keywords)
  for (const pg of [1, 2, 3]) pool.push(...(await src.searchProducts(kw, pg)).map((p) => ({ ...p, keyword: kw })));
const ranked = rank(pool, cfg);

const r = seeded(42);
const now = Date.now();
const posts = [];
const convs = [];
for (let d = 14; d >= 1; d--)
  for (let i = 0; i < 2; i++) {
    const p = ranked[(posts.length * 3) % ranked.length];
    const t = new Date(now - d * 864e5 + r.int(-3, 3) * 36e5);
    const sub_id = `demo${d}${i}`;
    const views = r.int(300, 6000);
    posts.push({
      sub_id, item_id: p.item_id, name: p.name, keyword: p.keyword, price: p.price,
      commission_rate: p.commission_rate, expected_commission: p.expected_commission, score: p.score,
      short_link: "", text: await writePost(p, local), post_id: `demo-${sub_id}`, reply_id: null,
      permalink: "", posted_at: t.toISOString(),
      metrics: { views, likes: Math.round(views / r.int(25, 60)), replies: r.int(0, 15), reposts: r.int(0, 6), quotes: r.int(0, 3) },
      orders: 0, commission: 0,
    });
    // 依曝光模擬訂單：曝光 × 點擊率 × 轉換率（放大 3 倍讓圖表有東西看）
    const orders = Array.from({ length: Math.floor(views / 10) }).filter(() => r.next() < 0.012 * 0.035 * 3).length;
    for (let k = 0; k < orders; k++)
      convs.push({
        conversion_id: `demo-${sub_id}-${k}`,
        purchase_time: Math.floor(Math.min(t.getTime() + r.float(1, 72) * 36e5, now) / 1000),
        commission: Math.round(p.price * p.commission_rate * r.float(0.8, 1.5) * 10) / 10,
        sub_ids: [sub_id, "threads"], items: [],
      });
  }
convs.sort((a, b) => a.purchase_time - b.purchase_time);
attribute(posts, convs);

const drafts = await Promise.all(
  ranked.slice(0, 3).map(async (p, i) => ({
    sub_id: `draft${i}`, item_id: p.item_id, name: p.name, keyword: p.keyword, price: p.price,
    expected_commission: p.expected_commission, score: p.score, short_link: "https://s.shopee.tw/示範連結",
    text: await writePost(p, local), reply: writeReply("https://s.shopee.tw/示範連結"),
    created_at: new Date(now - i * 36e5).toISOString(), status: "pending",
  })),
);

store.useDir(join(DATA_DIR, "demo"));
store.save("posts", posts);
store.save("conversions", convs);
store.save("drafts", drafts);
store.save("candidates", { updated_at: new Date().toISOString(), pool_size: pool.length, top: ranked.slice(0, 30) });
store.save("meta", {
  updated_at: new Date().toISOString(), modes: { shopee: "demo", threads: "demo" },
  total_posts: posts.length, total_drafts: drafts.length, total_orders: convs.length,
  total_commission: Math.round(convs.reduce((a, c) => a + c.commission, 0) * 100) / 100,
});
console.log(`demo: ${posts.length} 篇、${convs.length} 筆轉換、${drafts.length} 份草稿`);

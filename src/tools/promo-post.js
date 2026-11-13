/**
 * 帶貨片發布：依發布包（promo/<slug>.json）把影片＋主文發到 Threads，連結放在第一則留言。
 * 發布包由亞瑟整理、經葉里克先生核准後才放進 repo；這支程式不改寫任何文字。
 *
 * 發布包格式：
 * { "slug", "account": "ambition._6268", "name", "keyword", "price", "link", "video_url", "text", "reply", "approved_by", "approved_at" }
 *
 * 用法：node src/tools/promo-post.js promo/<slug>.json [--dry]
 */
import { readdirSync, readFileSync } from "node:fs";
import { Threads } from "../threads.js";
import * as store from "../storage.js";

const [arg, flag] = process.argv.slice(2);
// --due：挑一則已核准、發布時間已到、還沒發過的發布包（排程用，每次最多發一則）
let file = arg;
if (arg === "--due") {
  const posted = new Set(store.load("posts").map((p) => p.promo).filter(Boolean));
  const due = readdirSync("promo").filter((f) => f.endsWith(".json"))
    .map((f) => ({ f: `promo/${f}`, p: JSON.parse(readFileSync(`promo/${f}`, "utf8")) }))
    .filter(({ p }) => p.approved_at && p.post_at && Date.parse(p.post_at) <= Date.now() && !posted.has(p.slug))
    .sort((a, b) => Date.parse(a.p.post_at) - Date.parse(b.p.post_at));
  if (!due.length) { console.log("沒有到時間的帶貨片"); process.exit(0); }
  file = due[0].f;
}
const pkg = JSON.parse(readFileSync(file, "utf8"));
for (const k of ["account", "video_url", "text", "reply"]) if (!pkg[k]) throw new Error(`發布包缺少 ${k}`);
if (!pkg.approved_at && flag !== "--dry") throw new Error("發布包還沒有核准紀錄（approved_at），只能試跑");

const threads = new Threads(process.env.THREADS_ACCESS_TOKEN);
const who = await threads.username();
if (who !== pkg.account) throw new Error(`Threads 權杖是 @${who}，發布包指定 @${pkg.account}，停止發布`);

// GitHub Release 的下載網址會轉址到暫時網址；先解開，讓 Threads 直接抓檔案
const head = await fetch(pkg.video_url, { method: "HEAD", redirect: "follow" });
if (!head.ok) throw new Error(`影片網址打不開（${head.status}）`);
const video = head.url;
console.log(`帳號 @${who}・影片 ${head.headers.get("content-length") || "?"} bytes`);

if (flag === "--dry") { console.log("試跑：不發布\n" + pkg.text + "\n---\n" + pkg.reply); process.exit(0); }

const posts = store.load("posts");
if (posts.some((p) => p.promo === pkg.slug)) throw new Error(`${pkg.slug} 已經發過了`);
const post_id = await threads.publishVideo(pkg.text, video);
await new Promise((r) => setTimeout(r, 3000));
const reply_id = await threads.publishText(pkg.reply, post_id);
const permalink = await threads.permalink(post_id);
posts.push({
  sub_id: `promo-${pkg.slug}`, promo: pkg.slug, item_id: `promo-${pkg.slug}`, name: pkg.name, keyword: pkg.keyword || "帶貨片",
  price: pkg.price || 0, commission_rate: 0, expected_commission: 0, score: 0, short_link: pkg.link, text: pkg.text,
  video: pkg.video_url, post_id, reply_id, permalink, posted_at: new Date().toISOString(), metrics: {}, orders: 0, commission: 0,
});
store.save("posts", posts);
console.log(`✓ 已發布 ${permalink}`);

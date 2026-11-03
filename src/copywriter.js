/** Threads 貼文：優先用 Claude，失敗或沒金鑰時退回模板 */
import { env } from "./config.js";

const prompt = (p, tone) => `你是台灣 Threads 上的生活好物分享者。為以下商品寫一篇貼文主文。
規則：
- 繁體中文、${tone}
- 120 字以內，開頭一句要能讓人停下來滑
- 不要放網址、不要寫「點連結」，連結會放在留言
- 不誇大功效、不寫「最便宜」「保證」等無法證實的字眼
- 結尾可以丟一個問題引導留言
商品：${p.name}
${p.price ? `價格：NT$${Math.round(p.price)}　` : ""}${p.rating ? `評分：${p.rating}　` : ""}${p.sales ? `已售：${p.sales}` : ""}
${p.note ? `賣點：${p.note}` : ""}
只輸出貼文本文。`;

const short = (name) => name.replace(/[【】\[\]()（）]/g, " ").trim().slice(0, 24);

const TEMPLATES = [
  (p) => `最近入手的${short(p.name)}，用了一陣子覺得真的有感 👀\n${stats(p)}\n你們平常會選哪種？`,
  (p) => `幫大家省點踩雷時間：${short(p.name)}\n${stats(p)}\n有用過的來說說心得？`,
  (p) => `想找${p.keyword || "好用小物"}的可以看看這款👇\n${short(p.name)}\n${stats(p)}`,
];

function stats(p) {
  const s = [];
  if (p.rating) s.push(`評分 ${p.rating}`);
  if (p.sales) s.push(`已售 ${p.sales.toLocaleString()}`);
  if (p.price) s.push(`約 NT$${Math.round(p.price)}`);
  if (p.note) s.push(p.note);
  return s.join("｜") || "評價看了一圈都不錯";
}

export async function writePost(p, cfg) {
  const { copywriter: cw, posting } = cfg;
  let body = null;
  if (cw.provider === "claude" && env("ANTHROPIC_API_KEY")) {
    try {
      body = await claude(p, cw);
    } catch (e) {
      console.log(`[copywriter] Claude 失敗，改用模板：${e.message}`);
    }
  }
  body ||= TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)](p);
  const tags = posting.hashtags.map((t) => `#${t}`).join(" ");
  return `${body}\n\n${tags}\n${posting.disclosure}`.slice(0, posting.max_chars);
}

export const writeReply = (link) => `🔗 商品連結在這：${link}\n（價格與庫存以蝦皮頁面為準）`;

async function claude(p, cw) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env("ANTHROPIC_API_KEY"),
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: cw.model,
      max_tokens: 400,
      messages: [{ role: "user", content: prompt(p, cw.tone) }],
    }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()).content.map((b) => b.text || "").join("").trim();
}

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
${previousBlock(p)}只輸出貼文本文。`;

/** 舊品重推：把之前發過的文給 AI 看，要求換角度，避免被當成重複內容 */
function previousBlock(p) {
  const prev = (p.previous_texts || []).slice(-2);
  if (!prev.length) return "";
  const angles = "使用情境、解決的小困擾、送禮、和同類商品比較、季節或節日、開箱感想";
  return `這個商品之前發過，以下是舊文：
${prev.map((t, i) => `【舊文${i + 1}】${t.split("\n#")[0].trim()}`).join("\n")}
這次請換一個切入角度（例如：${angles}），開頭第一句和句型都不要和舊文相同。
`;
}

const short = (name) => name.replace(/[【】\[\]()（）]/g, " ").trim().slice(0, 24);

const TEMPLATES = [
  (p) => `最近入手的${short(p.name)}，用了一陣子覺得真的有感 👀\n${stats(p)}\n你們平常會選哪種？`,
  (p) => `幫大家省點踩雷時間：${short(p.name)}\n${stats(p)}\n有用過的來說說心得？`,
  (p) => `想找${p.keyword || "好用小物"}的可以看看這款👇\n${short(p.name)}\n${stats(p)}`,
];

/** 範本：舊品重推時避開上次用過的開頭 */
export function pickTemplate(p) {
  const used = (p.previous_texts || []).map((t) => t.slice(0, 8));
  const fresh = TEMPLATES.map((f) => f(p)).filter((t) => !used.includes(t.slice(0, 8)));
  const pool = fresh.length ? fresh : TEMPLATES.map((f) => f(p));
  return pool[Math.floor(Math.random() * pool.length)];
}

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
  body ||= pickTemplate(p);
  const tags = posting.hashtags.map((t) => `#${t}`).join(" ");
  return [body, "", tags, posting.disclosure].filter((x, i) => i < 3 || x).join("\n").trim().slice(0, posting.max_chars);
}

export const writeReply = (link) => `🔗 商品連結在這：${link}`;

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

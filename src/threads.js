/**
 * Threads Graph API：發文、在「自己的貼文」下留言、抓成效、延長 token。
 * 刻意不支援到別人貼文底下留言 —— 那是垃圾訊息行為，會被限流或停權。
 */
const BASE = "https://graph.threads.net/v1.0";
const METRICS = "views,likes,replies,reposts,quotes";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Threads {
  // 一律用 "me"：Threads 的使用者 ID 有 17 位數，超過 JavaScript 數字精度，
  // 經過 JSON.parse 後尾數會被四捨五入，變成「不存在的物件」（Threads 400）。
  constructor(token) {
    this.token = token;
    this.userId = "me";
  }

  async #req(method, path, params = {}) {
    const url = new URL(`${BASE}/${path}`);
    for (const [k, v] of Object.entries({ ...params, access_token: this.token })) url.searchParams.set(k, v);
    const r = await fetch(url, { method });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Threads ${r.status}: ${body.error?.message || ""}`);
    return body;
  }

  async publishText(text, replyTo) {
    const params = { media_type: "TEXT", text, ...(replyTo && { reply_to_id: replyTo }) };
    const { id: creation_id } = await this.#req("POST", `${this.userId}/threads`, params);
    await sleep(3000); // 官方建議建立容器後稍等再發布
    return (await this.#req("POST", `${this.userId}/threads_publish`, { creation_id })).id;
  }

  async permalink(id) {
    try {
      return (await this.#req("GET", id, { fields: "permalink" })).permalink || "";
    } catch {
      return "";
    }
  }

  async insights(id) {
    const { data = [] } = await this.#req("GET", `${id}/insights`, { metric: METRICS });
    return Object.fromEntries(data.map((m) => [m.name, m.values?.[0]?.value ?? m.total_value?.value ?? 0]));
  }

  /** 長效 token 效期 60 天，回傳延長後的 token */
  async refreshToken() {
    const url = new URL("https://graph.threads.net/refresh_access_token");
    url.searchParams.set("grant_type", "th_refresh_token");
    url.searchParams.set("access_token", this.token);
    const r = await fetch(url);
    return r.ok ? (await r.json()).access_token : null;
  }
}

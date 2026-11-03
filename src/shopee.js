/**
 * 選品來源：
 *   ShopeeApi   — 蝦皮聯盟 Open API（台灣）GraphQL
 *   QueueSource — queue.yaml 手動佇列（尚未取得 API 時）
 *   DemoSource  — 示範資料
 * 三者介面相同：searchProducts / shortLink / conversions
 *
 * API 認證：Authorization: SHA256 Credential={AppId}, Timestamp={ts}, Signature={sha256(AppId+ts+payload+Secret)}
 * 欄位名稱以核准後拿到的官方文件為準，有異動只改這個檔案。
 */
import { createHash } from "node:crypto";
import { seeded } from "./rand.js";

const ENDPOINT = "https://open-api.affiliate.shopee.tw/graphql";
const FIELDS = `itemId productName shopName price priceMin priceMax priceDiscountRate
  commissionRate commission sales ratingStar imageUrl productLink offerLink`;

export class ShopeeApi {
  constructor(appId, secret) {
    Object.assign(this, { appId, secret });
  }

  async #call(query) {
    const payload = JSON.stringify({ query });
    const ts = Math.floor(Date.now() / 1000);
    const sig = createHash("sha256").update(`${this.appId}${ts}${payload}${this.secret}`).digest("hex");
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `SHA256 Credential=${this.appId}, Timestamp=${ts}, Signature=${sig}`,
      },
      body: payload,
    });
    if (!r.ok) throw new Error(`Shopee HTTP ${r.status}`);
    const body = await r.json();
    if (body.errors) throw new Error(`Shopee API: ${JSON.stringify(body.errors)}`);
    return body.data;
  }

  /** sortType: 1 相關度 / 2 銷量 / 3 價高 / 4 價低 / 5 佣金高 */
  async searchProducts(keyword, page = 1, limit = 20, sortType = 2) {
    const q = `{ productOfferV2(keyword:${JSON.stringify(keyword)}, sortType:${sortType}, page:${page}, limit:${limit}) { nodes { ${FIELDS} } } }`;
    return (await this.#call(q)).productOfferV2.nodes.map(normalize);
  }

  /** subIds 用來追蹤訂單來自哪一篇貼文 */
  async shortLink(originUrl, subIds) {
    const q = `mutation { generateShortLink(input:{originUrl:${JSON.stringify(originUrl)}, subIds:${JSON.stringify(subIds.slice(0, 5))}}) { shortLink } }`;
    return (await this.#call(q)).generateShortLink.shortLink;
  }

  async conversions(startTs, endTs) {
    const out = [];
    let scroll = "";
    for (;;) {
      const q = `{ conversionReport(purchaseTimeStart:${startTs}, purchaseTimeEnd:${endTs}, limit:500, scrollId:${JSON.stringify(scroll)}) {
        nodes { conversionId purchaseTime totalCommission utmContent
          orders { orderStatus items { itemId itemName itemPrice qty itemTotalCommission } } }
        pageInfo { hasNextPage scrollId } } }`;
      const rep = (await this.#call(q)).conversionReport;
      for (const n of rep.nodes) {
        out.push({
          conversion_id: String(n.conversionId),
          purchase_time: Number(n.purchaseTime),
          commission: Number(n.totalCommission || 0),
          sub_ids: (n.utmContent || "").split("-").filter(Boolean),
          items: (n.orders || []).flatMap((o) => o.items || []),
        });
      }
      if (!rep.pageInfo?.hasNextPage) return out;
      scroll = rep.pageInfo.scrollId;
    }
  }
}

function normalize(n) {
  const f = (k) => Number(n[k] || 0);
  const disc = f("priceDiscountRate");
  return {
    item_id: String(n.itemId),
    name: n.productName || "",
    shop: n.shopName || "",
    price: f("priceMin") || f("price"),
    discount: disc > 1 ? disc / 100 : disc,
    commission_rate: f("commissionRate"),
    commission: f("commission"),
    sales: Math.round(f("sales")),
    rating: f("ratingStar"),
    image: n.imageUrl || "",
    link: n.offerLink || n.productLink || "",
  };
}

/** 半自動：從 queue.yaml 選品。連結已是使用者自己產生的分潤短連結，無法加 subId。 */
export class QueueSource {
  constructor(items) {
    this.items = items.map((i, idx) => ({
      item_id: `q-${String(i.link).split("/").pop() || idx}`,
      name: String(i.name),
      shop: i.shop || "",
      price: Number(i.price || 0),
      discount: Number(i.discount || 0),
      commission_rate: Number(i.commission_rate || 0),
      commission: Number(i.price || 0) * Number(i.commission_rate || 0),
      sales: Number(i.sales || 0),
      rating: Number(i.rating || 0),
      note: i.note || "",
      keyword: i.keyword || "未分類",
      link: String(i.link),
      manual: true,
    }));
  }
  async searchProducts(keyword, page = 1) {
    return page === 1 ? this.items.filter((i) => i.keyword === keyword) : [];
  }
  async all() {
    return this.items;
  }
  async shortLink(url) {
    return url;
  }
  async conversions() {
    return []; // 手動模式拿不到報表，請到蝦皮聯盟後台查看
  }
}

export class DemoSource {
  async searchProducts(keyword, page = 1, limit = 20) {
    const r = seeded(`${keyword}-${page}`);
    return Array.from({ length: limit }, (_, i) => {
      const price = r.pick([199, 299, 390, 499, 690, 899, 1290, 1980, 2490]);
      const rate = r.pick([0.02, 0.03, 0.05, 0.07, 0.1, 0.12]);
      return {
        item_id: `demo-${keyword}-${page}-${i}`,
        name: `【示範】${keyword} 熱銷款 #${page}${String(i).padStart(2, "0")}`,
        shop: r.pick(["好物選物所", "日常小舖", "生活研究室"]),
        price,
        discount: r.pick([0, 0.1, 0.2, 0.35]),
        commission_rate: rate,
        commission: Math.round(price * rate * 10) / 10,
        sales: r.int(20, 8000),
        rating: Math.round(r.float(4.3, 5.0) * 10) / 10,
        image: "",
        link: `https://shopee.tw/product/demo/${i}`,
      };
    });
  }
  async shortLink(url, subIds) {
    return `https://s.shopee.tw/demo-${subIds[0]}`;
  }
  async conversions() {
    return [];
  }
}

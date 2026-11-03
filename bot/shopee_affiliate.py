"""蝦皮聯盟行銷 Open API (Taiwan) 客戶端。

認證：Authorization: SHA256 Credential={AppId}, Timestamp={ts}, Signature={sha256(AppId+ts+payload+Secret)}
欄位名稱以官方文件為準；若官方調整，只需改這個檔案的 GraphQL 字串。
"""
from __future__ import annotations

import hashlib
import json
import random
import time

import requests

ENDPOINT = "https://open-api.affiliate.shopee.tw/graphql"

PRODUCT_FIELDS = """
  itemId productName shopName shopId
  price priceMin priceMax priceDiscountRate
  commissionRate sellerCommissionRate shopeeCommissionRate commission
  sales ratingStar imageUrl productLink offerLink productCatIds
"""


class ShopeeAffiliate:
    def __init__(self, app_id: str, secret: str, dry_run: bool = False):
        self.app_id, self.secret, self.dry_run = app_id, secret, dry_run

    # ── 低階 ────────────────────────────────────────────────
    def _call(self, query: str) -> dict:
        payload = json.dumps({"query": query}, separators=(",", ":"), ensure_ascii=False)
        ts = str(int(time.time()))
        sig = hashlib.sha256(f"{self.app_id}{ts}{payload}{self.secret}".encode()).hexdigest()
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"SHA256 Credential={self.app_id}, Timestamp={ts}, Signature={sig}",
        }
        r = requests.post(ENDPOINT, data=payload.encode(), headers=headers, timeout=30)
        r.raise_for_status()
        body = r.json()
        if body.get("errors"):
            raise RuntimeError(f"Shopee API error: {body['errors']}")
        return body["data"]

    # ── 選品 ────────────────────────────────────────────────
    def search_products(self, keyword: str, page: int = 1, limit: int = 20, sort_type: int = 2) -> list[dict]:
        """sort_type: 1 相關度 / 2 銷量 / 3 價高 / 4 價低 / 5 佣金高"""
        if self.dry_run:
            return _mock_products(keyword, page, limit)
        kw = json.dumps(keyword, ensure_ascii=False)
        q = f"{{ productOfferV2(keyword:{kw}, sortType:{sort_type}, page:{page}, limit:{limit}) {{ nodes {{ {PRODUCT_FIELDS} }} }} }}"
        return [_normalize(n) for n in self._call(q)["productOfferV2"]["nodes"]]

    # ── 短連結（subIds 用來追蹤是哪一篇貼文帶來的訂單）─────────
    def short_link(self, origin_url: str, sub_ids: list[str]) -> str:
        if self.dry_run:
            return f"https://s.shopee.tw/demo{abs(hash(origin_url + ''.join(sub_ids))) % 10**6}"
        url = json.dumps(origin_url)
        subs = json.dumps(sub_ids[:5])
        q = f"mutation {{ generateShortLink(input:{{originUrl:{url}, subIds:{subs}}}) {{ shortLink }} }}"
        return self._call(q)["generateShortLink"]["shortLink"]

    # ── 成效報表 ────────────────────────────────────────────
    def conversions(self, start_ts: int, end_ts: int) -> list[dict]:
        """回傳每筆轉換：{conversion_id, purchase_time, commission, sub_ids, items}"""
        if self.dry_run:
            return []
        out, scroll = [], ""
        while True:
            q = (
                f'{{ conversionReport(purchaseTimeStart:{start_ts}, purchaseTimeEnd:{end_ts}, limit:500, scrollId:"{scroll}") '
                "{ nodes { conversionId purchaseTime totalCommission utmContent "
                "orders { orderStatus items { itemId itemName itemPrice qty itemTotalCommission } } } "
                "pageInfo { hasNextPage scrollId } } }"
            )
            rep = self._call(q)["conversionReport"]
            for n in rep["nodes"]:
                out.append({
                    "conversion_id": str(n.get("conversionId")),
                    "purchase_time": n.get("purchaseTime"),
                    "commission": float(n.get("totalCommission") or 0),
                    "sub_ids": [s for s in (n.get("utmContent") or "").split("-") if s],
                    "items": [i for o in n.get("orders") or [] for i in o.get("items") or []],
                })
            info = rep.get("pageInfo") or {}
            if not info.get("hasNextPage"):
                return out
            scroll = info.get("scrollId", "")


def _normalize(n: dict) -> dict:
    f = lambda k: float(n.get(k) or 0)  # noqa: E731  API 多數數值以字串回傳
    return {
        "item_id": str(n.get("itemId")),
        "name": n.get("productName", ""),
        "shop": n.get("shopName", ""),
        "price": f("priceMin") or f("price"),
        "discount": f("priceDiscountRate") / 100 if f("priceDiscountRate") > 1 else f("priceDiscountRate"),
        "commission_rate": f("commissionRate"),
        "commission": f("commission"),
        "sales": int(f("sales")),
        "rating": f("ratingStar"),
        "image": n.get("imageUrl", ""),
        "link": n.get("offerLink") or n.get("productLink", ""),
    }


def _mock_products(keyword: str, page: int, limit: int) -> list[dict]:
    rnd = random.Random(f"{keyword}-{page}")
    items = []
    for i in range(limit):
        price = rnd.choice([199, 299, 390, 499, 690, 899, 1290, 1980, 2490])
        rate = rnd.choice([0.02, 0.03, 0.05, 0.07, 0.10, 0.12])
        items.append({
            "item_id": f"demo-{keyword}-{page}-{i}",
            "name": f"【示範】{keyword} 熱銷款 #{page}{i:02d}",
            "shop": rnd.choice(["好物選物所", "日常小舖", "生活研究室"]),
            "price": float(price),
            "discount": rnd.choice([0, 0.1, 0.2, 0.35]),
            "commission_rate": rate,
            "commission": round(price * rate, 1),
            "sales": rnd.randint(20, 8000),
            "rating": round(rnd.uniform(4.3, 5.0), 1),
            "image": "",
            "link": f"https://shopee.tw/product/demo/{i}",
        })
    return items

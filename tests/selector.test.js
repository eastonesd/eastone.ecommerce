import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";
import { passesFilters, expectedCommission, pick, performanceFactor } from "../src/selector.js";
import { pickTemplate } from "../src/copywriter.js";
import { attribute } from "../src/main.js";
import { QueueSource } from "../src/shopee.js";

const cfg = loadConfig();
const item = (o = {}) => ({
  item_id: "1", name: "x", price: 500, commission_rate: 0.08, commission: 40,
  sales: 2000, rating: 4.9, discount: 0.2, keyword: "a", ...o,
});

test("過濾條件", () => {
  assert.ok(passesFilters(item(), cfg.selection));
  assert.ok(!passesFilters(item({ commission_rate: 0.01 }), cfg.selection));
  assert.ok(!passesFilters(item({ price: 50 }), cfg.selection));
});

test("手動佇列缺欄位不被擋", () => {
  const [q] = new QueueSource([{ name: "保溫瓶", link: "https://s.shopee.tw/abc" }]).items;
  assert.ok(passesFilters(q, cfg.selection));
});

test("預期佣金公式", () => {
  assert.equal(expectedCommission(item(), cfg.profit, 1000), 1000 * 0.012 * 0.035 * 40);
});

test("冷卻期與品類分散", () => {
  const pool = [item({ item_id: "1" }), item({ item_id: "2" }), item({ item_id: "3", keyword: "b" })];
  const ids = pick(pool, cfg, [{ item_id: "3", posted_at: new Date().toISOString() }]).map((p) => p.item_id);
  assert.deepEqual(ids, ["1"]);
});

test("舊品重推依曝光表現調整排序", () => {
  const ago = new Date(Date.now() - 20 * 864e5).toISOString(); // 已過冷卻期
  const hist = [
    { item_id: "hot", posted_at: ago, metrics: { views: 900 } },
    { item_id: "cold", posted_at: ago, metrics: { views: 100 } },
  ];
  assert.equal(performanceFactor("hot", hist), 1.5);
  assert.equal(performanceFactor("cold", hist), 0.5);
  assert.equal(performanceFactor("new", hist), 1);
  const pool = [item({ item_id: "cold", keyword: "a" }), item({ item_id: "hot", keyword: "b" })];
  assert.equal(pick(pool, cfg, hist)[0].item_id, "hot");
});

test("範本重推時避開上次的開頭", () => {
  const p = item({ name: "保溫瓶" });
  for (let i = 0; i < 20; i++) {
    const prev = pickTemplate(p);
    assert.notEqual(pickTemplate({ ...p, previous_texts: [prev] }).slice(0, 8), prev.slice(0, 8));
  }
});

test("subId 佣金歸因", () => {
  const posts = [{ sub_id: "t1" }, { sub_id: "t2" }];
  attribute(posts, [
    { sub_ids: ["t1", "threads"], commission: 30 },
    { sub_ids: ["t1"], commission: 12.5 },
    { sub_ids: ["zzz"], commission: 99 },
  ]);
  assert.deepEqual(posts.map((p) => [p.orders, p.commission]), [[2, 42.5], [0, 0]]);
});

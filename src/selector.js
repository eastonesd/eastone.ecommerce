/** 選品 + 利潤規劃：過濾 → 預期佣金 → 綜合評分 → 排序（含冷卻期、品類分散） */

export function passesFilters(p, rules) {
  // 手動佇列（queue.yaml／LINE 送來的）是使用者親自挑的：不套用自動選品的門檻
  if (p.manual) return true;
  const [lo, hi] = rules.price_range;
  const ok = (v, test) => test(v);
  return (
    ok(p.commission_rate, (v) => v >= rules.min_commission_rate) &&
    ok(p.rating, (v) => v >= rules.min_rating) &&
    ok(p.sales, (v) => v >= rules.min_sales) &&
    ok(p.price, (v) => v >= lo && v <= hi)
  );
}

/** 單篇預期佣金 = 曝光 × 點擊率 × 轉換率 × 每單佣金 */
export function expectedCommission(p, profit, views) {
  const perOrder = p.commission || p.price * p.commission_rate;
  return (views || profit.est_views_per_post) * profit.est_click_rate * profit.est_conversion_rate * perOrder;
}

export function score(p, profit, views) {
  const w = profit.weights;
  const ec = expectedCommission(p, profit, views);
  const parts = {
    expected_commission: Math.min(ec / 50, 1), // NT$50/篇 視為滿分
    sales_momentum: Math.min(Math.log10((p.sales || 0) + 1) / 4, 1), // 1 萬銷量滿分
    rating: Math.max(0, Math.min((p.rating || 4.5) - 4, 1)), // 4.0→0, 5.0→1
    discount: Math.min((p.discount || 0) / 0.5, 1),
  };
  const total = Object.keys(w).reduce((s, k) => s + parts[k] * w[k], 0);
  return { ...p, expected_commission: round(ec, 2), score: round(total, 4) };
}

export function recentlyPosted(history, days, now = Date.now()) {
  const cutoff = now - days * 864e5;
  return new Set(history.filter((h) => Date.parse(h.posted_at) >= cutoff).map((h) => h.item_id));
}

export function rank(pool, cfg, views) {
  const seen = new Set();
  return pool
    .filter((p) => passesFilters(p, cfg.selection) && !seen.has(p.item_id) && seen.add(p.item_id))
    .map((p) => score(p, cfg.profit, views))
    .sort((a, b) => b.score - a.score);
}

/**
 * 舊品重推依實際表現加減分：該商品過去平均曝光 ÷ 全部貼文平均曝光，限制在 0.5～1.5 倍。
 * 曝光數還沒回來（或樣本太少）的商品不調整。
 */
export function performanceFactor(itemId, history) {
  const views = (h) => h.metrics?.views || 0;
  const withViews = history.filter((h) => views(h) > 0);
  const mine = withViews.filter((h) => h.item_id === itemId);
  if (!mine.length || withViews.length < 2) return 1;
  const avg = (a) => a.reduce((s, h) => s + views(h), 0) / a.length;
  return Math.min(1.5, Math.max(0.5, avg(mine) / avg(withViews)));
}

export function pick(pool, cfg, history, views) {
  const skip = recentlyPosted(history, cfg.selection.repost_cooldown_days);
  const picked = [];
  const usedKw = new Set();
  const ranked = rank(pool, cfg, views)
    .map((p) => {
      const f = performanceFactor(p.item_id, history);
      return f === 1 ? p : { ...p, score: round(p.score * f, 4), perf_factor: round(f, 2) };
    })
    .sort((a, b) => b.score - a.score);
  for (const p of ranked) {
    if (skip.has(p.item_id) || usedKw.has(p.keyword)) continue;
    picked.push(p);
    usedKw.add(p.keyword);
    if (picked.length >= cfg.posting.posts_per_run) break;
  }
  return picked;
}

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

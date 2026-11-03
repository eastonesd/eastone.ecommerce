// 可重現的亂數（示範資料用）
export function seeded(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 3432918353), (h = (h << 13) | (h >>> 19));
  let a = h >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    float: (lo, hi) => lo + next() * (hi - lo),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}

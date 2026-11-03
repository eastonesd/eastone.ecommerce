import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DATA_DIR = join(ROOT, "dashboard", "data");

export const env = (k, d = "") => (process.env[k] ?? d).trim();

export function loadConfig() {
  return YAML.parse(readFileSync(join(ROOT, "config.yaml"), "utf8"));
}

export function loadQueue() {
  const p = join(ROOT, "queue.yaml");
  if (!existsSync(p)) return [];
  return (YAML.parse(readFileSync(p, "utf8"))?.items ?? []).filter((i) => i?.name && i?.link);
}

/**
 * 依現有金鑰自動決定模式：
 *   選品來源 shopee: api（有 Open API）| queue（手動佇列）| demo（示範資料）
 *   發布方式 threads: api（真的發文）| draft（只產生草稿）
 */
export function detectModes() {
  const hasShopee = env("SHOPEE_APP_ID") && env("SHOPEE_SECRET");
  const hasThreads = env("THREADS_ACCESS_TOKEN");
  const dry = env("DRY_RUN", "1") === "1";
  return {
    shopee: hasShopee ? "api" : loadQueue().length ? "queue" : "demo",
    threads: hasThreads && !dry ? "api" : "draft",
  };
}

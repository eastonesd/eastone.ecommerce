import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./config.js";

let dir = DATA_DIR;
export const useDir = (d) => (dir = d);

export function load(name, fallback = []) {
  const p = join(dir, `${name}.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback;
}

export function save(name, data) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(data, null, 2) + "\n");
}

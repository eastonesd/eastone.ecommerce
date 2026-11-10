/**
 * 把 Threads 授權碼換成「長效 token」（60 天，機器人會自動續期）。
 *
 *   本機：npm run token -- <授權碼>
 *   雲端：Actions → threads-token → 貼上授權碼（需設定 GH_PAT，會自動寫回 Secrets）
 *
 * 授權碼從儀表板的 token.html 取得。需要環境變數 THREADS_APP_ID、THREADS_APP_SECRET。
 */
import { writeFileSync } from "node:fs";
import { env } from "../config.js";

export const REDIRECT_URI = env("THREADS_REDIRECT_URI", "https://eastonesd.github.io/eastone.ecommerce/token.html");

export async function exchange(code) {
  const client_id = env("THREADS_APP_ID");
  const client_secret = env("THREADS_APP_SECRET");
  if (!client_id || !client_secret) throw new Error("缺少 THREADS_APP_ID 或 THREADS_APP_SECRET");
  code = code.replace(/#_$/, "").trim();

  // 1) 授權碼 → 短期 token（1 小時）
  const r1 = await fetch("https://graph.threads.net/oauth/access_token", {
    method: "POST",
    body: new URLSearchParams({ client_id, client_secret, code, grant_type: "authorization_code", redirect_uri: REDIRECT_URI }),
  });
  const short = await r1.json();
  if (!r1.ok) throw new Error(`換短期 token 失敗：${short.error?.message || r1.status}（授權碼只能用一次、1 小時內有效）\n` +
    `  本次使用 App ID 末四碼 ${client_id.slice(-4)}、回呼網址 ${REDIRECT_URI}\n` +
    `  請確認 token.html 輸入的 App ID 末四碼相同，且兩者都是「Threads 設定」頁面裡的 Threads 應用程式編號／密鑰`);

  // 2) 短期 → 長效 token（60 天）
  const url = new URL("https://graph.threads.net/access_token");
  url.search = new URLSearchParams({ grant_type: "th_exchange_token", client_secret, access_token: short.access_token });
  const r2 = await fetch(url);
  const long = await r2.json();
  if (!r2.ok) throw new Error(`換長效 token 失敗：${long.error?.message || r2.status}`);
  return { token: long.access_token, userId: String(short.user_id), expiresDays: Math.round(long.expires_in / 86400) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [code, flag] = process.argv.slice(2);
  if (!code) {
    console.log("用法：npm run token -- <授權碼>\n先開啟儀表板的 token.html 取得授權碼。");
    process.exit(1);
  }
  try {
    const { token, userId, expiresDays } = await exchange(code);
    if (flag === "--files") {
      // 給 GitHub Actions 用：寫成檔案，不印到 log
      writeFileSync(".threads-token", token);
      writeFileSync(".threads-user", userId);
      console.log(`✓ 取得長效 token（${expiresDays} 天），使用者 ID ${userId}`);
    } else {
      console.log(`\n✓ 長效 token（${expiresDays} 天有效）：\n\n${token}\n\nTHREADS_USER_ID=${userId}\n\n請貼到 GitHub → Settings → Secrets → THREADS_ACCESS_TOKEN`);
    }
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
}

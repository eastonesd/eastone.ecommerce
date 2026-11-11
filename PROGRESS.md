# 東石電商（eastone.ecommerce）進度交接

> 寫給：負責本 repo 的 Claude 對話。由 A.R.T.H.U.R.（eastonesd/arthur）在 2026-11-12 整理。
> 你上次停在「還沒申請到 Threads API」——那之後發生了很多事，**請先讀完這份再動手**，並 `git pull`。

## 一句話現況

**Threads API 已打通、真的在自動發文**（DRY_RUN=0），而且主人可以在 **Discord 用 `/ec` 填表單**半自動上架：
填完 → A.R.T.H.U.R. 寫進 `queue.yaml` → push 觸發本 repo 的 bot → 1～2 分鐘內發到 Threads → `#東石電商` 頻道收到通知。

已發出 2 篇：
- SL光速頂級無塵艙滿版玻璃保護貼（2026-11-10）https://www.threads.com/@ambition._6268/post/DfjegAPFkk7
- 橘子工坊洗碗精（2026-11-10）https://www.threads.com/@ambition._6268/post/DfjhqCEGxon

## 名稱與品牌

- repo 從 shopee.robot 改名為 **eastone.ecommerce**；對外名稱是 **東石電商**（本機資料夾可能還叫 eastone.ecommerse，拼字不同無妨）。
- 儀表板已改成東石藍金配色、EC 頭像（`dashboard/icons/`），網址 https://eastonesd.github.io/eastone.ecommerce/

## Threads 已完成的事

| 項目 | 狀態 |
|---|---|
| Threads App 與授權 | ✅ 主人已建立；`dashboard/token.html` 走 OAuth，`src/tools/threads-token.js` 換長效權杖 |
| 權杖自動續期 | ✅ 存在 repo secrets（`THREADS_ACCESS_TOKEN` 等），用 `GH_PAT` 自動更新 |
| 正式發文 | ✅ repo 變數 `DRY_RUN=0` |
| **Threads 400「Object does not exist」** | ✅ 已修：Threads 使用者 ID 有 17 位數，`JSON.parse` 會失去精度。`src/threads.js` **一律用 `me`**，不要改回數字 ID |
| AI 文案 | ✅ `config.yaml` → `copywriter.provider: claude`（claude-haiku-5-5）；主人已在 repo secrets 設 `ANTHROPIC_API_KEY`（沒有時自動退回範本） |

## 這幾天改過的規則（主人親自要求）

- **排程**：每天台北 **12:00、19:00、22:00** 發文（`.github/workflows/bot.yml` cron `0 4/11/14 * * *`），另每 6 小時同步成效。
- **拿掉揭露行**：`config.yaml` → `posting.disclosure: ""`（主人認為「#分潤連結…」影響流量；已告知台灣推薦廣告揭露規範的風險，由主人決定）。
- **留言區**只留「🔗 商品連結在這：<連結>」，刪掉「（價格與庫存以蝦皮頁面為準）」。
- **手動挑的商品不套自動選品門檻**：`queue.yaml` 的商品（`manual: true`）不檢查佣金 4%、價格 150～3000、評分、銷量（`src/selector.js` `passesFilters`）。門檻只用在將來的自動搜尋。

## 東石生態整合（A.R.T.H.U.R. 那邊做的，本 repo 不用改程式）

### Discord 半自動發文：`/ec`
- 伺服器「EASTONE SYSTEM」，頻道 `#東石電商`。主人與 `/allow` 加入的人可用。
- 表單欄位：商品名稱、分潤連結（必須 `https://s.shopee.tw/…` 或 `shopee.tw`）、分類、價格／佣金比例（如「189／10%」）、賣點。
- A.R.T.H.U.R. 用 GitHub Contents API **在 `queue.yaml` 尾端追加一筆**，commit 訊息「Discord 加入商品：…」（**沒有** `[skip ci]`，因為要靠這個 push 觸發發文）。

### 通知（送到 `#東石電商`）
A.R.T.H.U.R. 的 arthur-hub 每 10 分鐘讀本 repo：
- `dashboard/data/meta.json` 的 `total_posts` 增加 → 讀 `dashboard/data/posts.json` 最後幾筆，貼「已發文：<name>」＋ permalink、價格、佣金。
- 任何 workflow 失敗（24 小時內，同一次只報一次）→ 紅色警告。

### A.R.T.H.U.R. 儀表板的「東石電商」磚
顯示累計佣金、近 7 天、**業績結案倒計時**（每月最後一天 23:50 台北）與**下次撥款日**
（9 月→11/10、10 月→12/10、11 月→12/28、12 月→1/25，之後每月業績於次月 25 日撥款）。

### LINE
原本 LINE 也有 EC 表單，已撤掉；工作入口只剩 Discord。

## ⚠️ 契約：這些改了會讓整合壞掉（要改請先告知 A.R.T.H.U.R.）

1. `queue.yaml` 結構：頂層 `items:` 清單，欄位 `name`、`link`、`keyword`、`price`、`commission_rate`（小數，0.1＝10%）、`note`。
2. bot workflow 必須在 **push 到 `queue.yaml`** 時觸發。
3. `dashboard/data/meta.json` 的 `total_posts`、`total_drafts`、`total_commission`；`conversions.json` 的 `purchase_time`、`commission`。
4. `dashboard/data/posts.json` 每筆至少有 `name`、`permalink`、`text`、`price`、`commission_rate`，且**依時間順序追加**。

## 舊品重推（2026-11-12 新增）

- `queue.yaml` 的商品發完**不會被移除**，過了 14 天冷卻（`repost_cooldown_days`）自動重新上場。
- 重推時 AI 文案會看到舊文，被要求換切入角度、開頭與句型不得重複；沒有 AI 時範本也會避開上次的開頭（`src/copywriter.js`）。
- 排序依實際曝光加權：該商品平均曝光 ÷ 全部貼文平均曝光，限制 0.5～1.5 倍（`src/selector.js` `performanceFactor`）。
- 沒有改動上方任何契約欄位。

## 待辦／觀察到的問題

1. **佇列空了**：兩個商品都發過（同商品 14 天冷卻），11/11 的三個時段都沒有東西可發。需要主人用 `/ec` 補貨，或接上蝦皮聯盟 API 自動選品。
2. **蝦皮聯盟 API 還沒接**：`meta.json` 的 `modes.shopee` 是 `queue`，佣金與成交都還是 0、`conversions.json` 沒有資料。有 API 後才能自動選品與對帳。
3. ~~本機 `npm test` selector 測試失敗~~：2026-11-12 重跑 7 項全數通過，已無此問題。
4. 主人看不懂英文：回覆、文件、commit 訊息都用繁體中文。

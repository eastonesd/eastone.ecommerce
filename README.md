# shopee.robot 🛒🤖

蝦皮分潤 × Threads 自動化機器人：**選品 → 利潤規劃 → 寫文 → 發 Threads → 留言貼分潤連結 → 儀表板統計**。
全部用 JavaScript（Node.js）寫成：機器人在 GitHub Actions 上定時執行，儀表板是可以安裝到手機和電腦的 App（PWA）。

📱 儀表板：https://eastonesd.github.io/eastone.ecommerce/
- iPhone：用 Safari 開啟 → 分享 → **加入主畫面**
- Android / 電腦：用 Chrome 開啟 → 網址列旁的 **安裝**，或頁面右上角的「安裝 App」按鈕

## 三段式上線：沒有 API 也能先用

| 階段 | 你有的東西 | 機器人做什麼 |
|---|---|---|
| **① 半自動**（現在） | 只有蝦皮分潤帳號 | 你把商品和分潤連結填進 `queue.yaml` → 機器人評分、寫文案 → 儀表板出現**草稿**，按「複製」貼到 Threads |
| **② 自動選品** | + 蝦皮 Open API | 自動搜尋、篩選、評分商品，每篇連結帶追蹤碼，能算出**每一篇**實際賺多少 |
| **③ 全自動** | + Threads API | 自動發文、留言放連結、回收曝光/互動數據 |

模式會依你設定的金鑰**自動切換**，儀表板右上角會標示目前的模式。

### ① 半自動模式：現在就能用

1. 到蝦皮聯盟後台，對想推的商品按「取得連結」，複製分潤短連結。
2. 在 GitHub 打開 `queue.yaml` → 鉛筆圖示編輯，照範例加入商品，按 **Commit changes**：
   ```yaml
   items:
     - name: 304不鏽鋼保溫瓶 750ml
       link: https://s.shopee.tw/XXXXXXX
       keyword: 保溫瓶
       price: 399
       commission_rate: 0.07
       note: 冬天保溫 12 小時
   ```
3. 約 1 分鐘後，儀表板的「待發布草稿」會出現文案。之後每天中午和晚上也會自動挑新商品產生草稿。

## 申請 API

### 蝦皮聯盟 Open API
1. 在 affiliate.shopee.tw 成為推廣者（綁定收款資料）。
2. 在後台找到 **Open API** 入口，依指示加官方 LINE、填表申請。審核條件沒有公開，據使用者分享最久可能要一個月，被拒絕也不會通知，要自己回去看。
3. 核准後取得 **App ID / Secret**，填進 GitHub Secrets：`SHOPEE_APP_ID`、`SHOPEE_SECRET`。

### Threads API（需要 Facebook 帳號）
Meta 開發者帳號只能用 Facebook 登入。你可以另外開一個 Facebook 帳號專門用來申請，不必和 Threads 帳號同名，只要能登入開發者後台即可。

1. developers.facebook.com → 建立應用程式 → 使用案例選 **存取 Threads API**。
2. **使用案例 → 自訂 → 權限**，加入 `threads_basic`、`threads_content_publish`、`threads_manage_replies`、`threads_manage_insights`。
3. **Threads 設定 → 重新導向回呼網址** 填入：`https://eastonesd.github.io/eastone.ecommerce/token.html`
4. **應用程式角色 → 角色 → 新增人員 → Threads 測試人員**，填你的 Threads 帳號。
   再到 Threads App → 設定 → 帳號 → **網站權限** 接受邀請（最常漏掉的一步）。
5. 取得 token：
   - 把 Threads App ID / Secret 存進 Secrets：`THREADS_APP_ID`、`THREADS_APP_SECRET`
   - 建立 `GH_PAT`（見下方），讓機器人能自己更新 token
   - 開啟 [token.html](https://eastonesd.github.io/eastone.ecommerce/token.html) → 輸入 App ID → 授權 → 複製授權碼
   - repo → **Actions → threads-token → Run workflow** → 貼上授權碼 → 完成後 token 會自動寫進 Secrets
6. 確認一切正常後，到 **Settings → Variables** 新增 `DRY_RUN` = `0`，機器人才會真的發文。

> **GH_PAT**：GitHub → Settings → Developer settings → Fine-grained tokens → 只選這個 repo → 權限 **Secrets: Read and write**。存成 repo Secret `GH_PAT`。
> 有了它，機器人每次執行都會自動延長 Threads token，60 天到期的問題就解決了。

## 開發

```bash
npm install
cp .env.example .env
npm run demo        # 產生示範資料
npm run select      # 只看選品結果
npm run run         # 完整流程（沒有金鑰時只會產生草稿）
npm test
npm run dashboard   # 本機看儀表板 → http://localhost:8000
```

| 檔案 | 功能 |
|---|---|
| `src/shopee.js` | 蝦皮 Open API / 手動佇列 / 示範資料，三種選品來源 |
| `src/selector.js` | 篩選、預期佣金、綜合評分、冷卻期、品類分散 |
| `src/copywriter.js` | Claude 或模板寫文案，自動附分潤揭露 |
| `src/threads.js` | 發文、自己貼文下留言、成效、token 續期 |
| `src/main.js` | `select` / `post` / `sync` / `run` |
| `src/tools/threads-token.js` | 授權碼 → 長效 token |
| `dashboard/` | PWA 儀表板、草稿區、token 授權頁 |
| `config.yaml` | 選品條件、利潤假設、發文頻率、文案語氣 |
| `queue.yaml` | 手動商品佇列 |

### 利潤規劃
```
單篇預期佣金 = 曝光 × 點擊率 × 轉換率 × 每單佣金
```
一開始使用 `config.yaml` 的假設值；累積 5 篇真實數據後，曝光改用最近 30 篇的平均值。儀表板會並列「預估 vs 實際」，供你調整參數。

## 規範與風險

- **分潤揭露**：每篇都會自動附上，請勿移除（公平會對網路推薦行銷有揭露要求）。
- **只在自己貼文下留言**：自動到別人貼文底下留言屬於垃圾訊息，會被限流或停權，本專案不提供此功能。
- **頻率**：預設每天最多 4 篇，連發間隔 20 秒。新帳號建議先手動經營，再逐步放量。
- **公開資料**：repo 是公開的，`dashboard/data/` 裡的佣金數據任何人都看得到。如果介意，可以把 repo 改成私人（私人 repo 使用 GitHub Pages 需要付費方案）。

# shopee.robot 🛒🤖

蝦皮分潤 × Threads 自動化機器人：**選品 → 利潤規劃 → 寫文 → 發 Threads → 留言貼分潤連結 → 儀表板統計**。
全部跑在 GitHub Actions 上，不需要自己的伺服器；儀表板由 GitHub Pages 提供。

儀表板：https://eastonesd.github.io/shopee.robot/

```
┌──────────────┐   productOfferV2    ┌──────────┐  Claude / 模板  ┌────────────┐
│ 蝦皮聯盟 API  │ ─────────────────▶ │  選品評分  │ ─────────────▶ │  貼文文案   │
└──────────────┘                     └──────────┘                 └─────┬──────┘
       ▲  conversionReport（依 subId 歸因）                              │ Threads API
       │                                                                 ▼
┌──────┴───────┐  dashboard/data/*.json   ┌──────────┐   主文 + 留言放短連結
│   GitHub     │ ◀────────────────────── │  sync    │ ◀──────── insights
│   Pages 儀表板│                          └──────────┘
└──────────────┘
```

## 模組

| 檔案 | 功能 |
|---|---|
| `bot/shopee_affiliate.py` | 蝦皮聯盟 Open API：商品搜尋、產生帶 subId 的短連結、轉換報表 |
| `bot/selector.py` | 過濾（佣金率/評分/銷量/價格帶）、預期佣金估算、綜合評分、冷卻期與品類分散 |
| `bot/copywriter.py` | 用 Claude 寫貼文（沒金鑰自動改用模板），自動附分潤揭露 |
| `bot/threads_client.py` | Threads 發文、在**自己貼文**下留言放連結、抓曝光/互動、延長 token |
| `bot/main.py` | CLI：`select` / `post` / `sync` / `run` |
| `dashboard/` | 靜態儀表板：佣金、成交、曝光、RPM、預估 vs 實際、候選商品池 |

### 利潤規劃邏輯

```
單篇預期佣金 = 曝光 × 點擊率 × 轉換率 × 每單佣金
```
初期用 `config.yaml` 的預設值；累積 5 篇以上真實數據後，曝光改用最近 30 篇的平均值。
每篇貼文的短連結帶獨立 `subId`，蝦皮報表回來後能精準算出**每一篇**實際賺了多少，
儀表板會並列預估與實際，讓你持續調整選品參數。

## 開始使用

```bash
pip install -r requirements.txt
cp .env.example .env          # 先不填金鑰也能跑
python -m bot.main run        # DRY_RUN：用示範資料走完整流程，不會真的發文
python -m pytest -q
python -m http.server -d dashboard   # 本機看儀表板 → http://localhost:8000
```

### 上線步驟

1. **蝦皮聯盟行銷**：在 affiliate.shopee.tw 申請成為推廣者，再申請 Open API 取得 `App ID` / `Secret`。
2. **Threads API**：Meta for Developers 建立 App → 加入 Threads 使用案例 → 授權 `threads_basic`、`threads_content_publish`、`threads_manage_insights`、`threads_manage_replies` → 換成長效 token。
3. GitHub repo → Settings → Secrets and variables → Actions：
   - Secrets：`SHOPEE_APP_ID`、`SHOPEE_SECRET`、`THREADS_ACCESS_TOKEN`、`THREADS_USER_ID`、（選填）`ANTHROPIC_API_KEY`
   - Variables：`DRY_RUN` = `0`（確認一切正常後再改）
4. Settings → Pages → Source 選 **GitHub Actions**。
5. Actions → `bot` → Run workflow，先用 `select` 確認選品結果合理。

排程：每天台北 12:07、20:07 發文（每次最多 2 篇），每 6 小時同步成效。

## 規範與風險（請務必看）

- **揭露**：每篇自動附上分潤揭露文字。依公平會對網路推薦行銷的規範，請勿移除。
- **不對別人的貼文留言**：本專案只在自己貼文下留言放連結。到他人貼文底下自動留言屬於垃圾訊息，會被限流或停權。
- **發文頻率**：預設每天 4 篇以內，連發間隔 20 秒。新帳號建議先手動經營一陣子，再逐步提高。
- **API 欄位**：蝦皮 GraphQL 欄位名稱若有異動，只需修改 `bot/shopee_affiliate.py`。
- Threads 長效 token 60 天到期，機器人每次執行會自動延長；若長期未執行導致過期，需重新產生並更新 Secret。

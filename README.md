# 香格里拉：虛實邊界 Shangri-La: Realistic Frontier

一款用網頁技術（Three.js）打造的沙盒採集 / 建造 / 生存遊戲。電腦、平板、手機都能玩：

- **Windows / macOS / Linux**：打包成桌面 App（Electron）
- **Android**：打包成原生 App（Capacitor）
- **iOS**：不用上 App Store，直接用 Safari 打開網址、「加入主畫面」即可像 App 一樣全螢幕啟動（PWA）

<p align="center"><img src="assets/logo/icons/logo-256.png" width="140" /></p>

## 專案架構

```
shangri-la/
├─ web/                  ← 遊戲本體（純 HTML + Three.js，唯一的「真相來源」）
│  ├─ index.html
│  ├─ manifest.json      ← PWA 設定（讓手機可以「加入主畫面」）
│  ├─ sw.js              ← Service Worker，離線也能開啟
│  └─ assets/logo/
├─ electron/             ← 桌面版外殼（Windows / macOS / Linux）
├─ mobile/                ← Android 外殼設定（Capacitor）
├─ assets/logo/          ← Logo 原始檔（SVG）與各尺寸圖示
└─ .github/workflows/
   ├─ deploy-pages.yml    ← 自動部署網頁版到 GitHub Pages（產生可分享的網址）
   ├─ electron-build.yml  ← 自動編譯 Windows/macOS/Linux 安裝檔
   └─ android-build.yml   ← 自動編譯 Android APK
```

之後所有玩法上的修改，只需要編輯 `web/index.html`；桌面版、Android、PWA 都是直接讀取這份網頁內容。

---

## 第一步：建立新的 GitHub repo 並拿到能玩的網址

1. 到 GitHub 右上角 **+ → New repository**，取名（例如 `shangri-la-frontier`），
   **必須是 Public**（免費帳號的 GitHub Pages 只支援公開 repo），不要勾選任何初始化選項。
2. 把這個資料夾內容 push 上去：
   ```bash
   cd shangri-la
   git init
   git add .
   git commit -m "init: shangri-la frontier project"
   git branch -M main
   git remote add origin https://github.com/<你的帳號>/<repo名稱>.git
   git push -u origin main
   ```
3. 到 repo 的 **Settings → Pages**，「Build and deployment」→ Source 選 **GitHub Actions**（不是選 branch，這點最容易搞錯，也是網址常常跑不出來的主因）。
4. 到 **Actions** 頁籤，確認 `Deploy Web (GitHub Pages)` 這個 workflow 有跑起來、變成綠勾勾（第一次 push 後可能要等 1～2 分鐘，或手動點 "Run workflow"）。
5. 跑完之後，網址會是：
   ```
   https://<你的帳號>.github.io/<repo名稱>/
   ```
   也可以在 Settings → Pages 頁面上方直接看到這個網址。

**常見「網址跑不出來」的原因**：
- Pages 的 Source 沒設成 `GitHub Actions`（設成了某個 branch，但我們是用 Actions 部署，兩者要對上）
- repo 是 **Private**（免費帳號 Pages 需要 Public repo，或升級付費方案）
- Actions 頁籤裡 workflow 顯示紅叉 → 點進去看錯誤訊息，通常是路徑或權限問題
- 第一次部署有時候要等幾分鐘才會生效，重新整理看看

## iOS：直接用網頁「加入主畫面」

不用上架 App Store，也不用 Xcode：

1. 用 iPhone/iPad 的 **Safari**（一定要 Safari，其他瀏覽器不支援）打開上面那個 GitHub Pages 網址
2. 點下方分享按鈕（方框加箭頭）→ **加入主畫面**
3. 桌面會出現一個有 Logo 的圖示，點開會全螢幕啟動，跟原生 App 體驗很接近，也支援離線開啟（已經內建 Service Worker）

Android 也可以用同樣方式從 Chrome「加入主畫面」，或走下面的原生 App 打包方式上架 Google Play。

---

## 本機開發：直接玩網頁版

不需要安裝任何東西，直接用瀏覽器打開 `web/index.html`（需連網載入 Three.js）。

## 打包成 Windows / macOS / Linux 桌面版（Electron）

```bash
cd electron
npm install
npm run start        # 開發模式先跑跑看
npm run dist:win      # 產生 Windows 安裝檔 (.exe)
npm run dist:mac      # 產生 macOS 安裝檔 (.dmg)，需在 Mac 上執行
npm run dist:linux    # 產生 Linux 安裝檔 (.AppImage)
```

編譯結果會輸出到 `dist-electron/`。Windows 版可以在 Linux/Mac 上跨平台編譯；macOS 版必須在真正的 Mac 上編譯。

## 打包成 Android App（Capacitor）

```bash
cd mobile
npm install
npx cap add android      # 第一次執行，產生 Android 原生專案，記得把產生的 android/ 資料夾 commit 進 git
npx cap sync              # 之後每次改完 web/index.html，同步一次
npx cap open android      # 用 Android Studio 打開，簽名後可產生 .apk / .aab 上架 Google Play
```

## GitHub Actions 自動化

push 到 `main` 之後：

| workflow | 作用 |
|---|---|
| `deploy-pages.yml` | 自動把 `web/` 部署到 GitHub Pages，產生可分享的網址 |
| `electron-build.yml` | 自動編譯 Windows / macOS / Linux 安裝檔，可在 Actions 頁籤下載 Artifact |
| `android-build.yml` | 自動編譯 Android Debug APK（前提：已 commit `mobile/android`） |

## 橫向 / 響應式支援

- 手機直向時會自動顯示「請將裝置轉為橫向」提示
- 平板／桌面較大螢幕時，UI 面板與搖桿大小會自動調整比例

## Logo

暫定 Logo 位於 `assets/logo/logo.svg`，`assets/logo/icons/` 底下已經預先產生好各平台需要的尺寸，包含 Windows `.ico`。

## 待辦

- [ ] Windows/Android 正式簽名憑證（上架 Microsoft Store / Google Play 用）
- [ ] 正式 Logo 設計（目前是暫定版本）
- [ ] 遊戲內容擴充

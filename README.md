# 香格里拉：虛實邊界 Shangri-La: Realistic Frontier

一款用網頁技術（Three.js）打造的沙盒採集 / 建造 / 生存遊戲，支援桌面（Windows / macOS / Linux）與行動裝置（iOS / Android），電腦、平板、手機（橫向）皆可遊玩。

<p align="center"><img src="assets/logo/icons/logo-256.png" width="140" /></p>

## 專案架構

```
shangri-la/
├─ web/                  ← 遊戲本體（純 HTML + Three.js，唯一的「真相來源」）
│  ├─ index.html
│  ├─ manifest.json
│  └─ assets/logo/       ← 遊戲內使用的圖示（web 版自帶一份，供打包工具讀取）
├─ electron/             ← 桌面版外殼（Windows / macOS / Linux）
│  ├─ main.js
│  └─ package.json
├─ mobile/                ← 行動版外殼（iOS / Android，透過 Capacitor）
│  ├─ capacitor.config.json
│  └─ package.json
├─ assets/logo/          ← Logo 原始檔（SVG）與各尺寸圖示、Windows .ico
└─ .github/workflows/    ← GitHub Actions：push 後自動編譯三平台安裝檔
```

之後所有玩法上的修改，只需要編輯 `web/index.html`；桌面版與行動版都是直接讀取這份網頁內容，不需要另外維護三份程式碼。

## 本機開發：直接玩網頁版

不需要安裝任何東西，直接用瀏覽器打開：

```
web/index.html
```

（因為會從 CDN 載入 Three.js，需要連網。）

## 打包成 Windows / macOS / Linux 桌面版（Electron）

```bash
cd electron
npm install
npm run start      # 開發模式先跑跑看
npm run dist:win    # 產生 Windows 安裝檔 (.exe)
npm run dist:mac    # 產生 macOS 安裝檔 (.dmg)，需在 Mac 上執行
npm run dist:linux  # 產生 Linux 安裝檔 (.AppImage)
```

編譯結果會輸出到 `dist-electron/`。

> Windows 版可以在 Linux/Mac 上跨平台編譯；macOS 版**必須**在真正的 Mac 上編譯（Apple 的限制）。

## 打包成 iOS / Android App（Capacitor）

第一次設定（每個平台只需執行一次，會產生 `mobile/android`、`mobile/ios` 原生專案資料夾，記得把它們一起 commit 進 git）：

```bash
cd mobile
npm install
npx cap add android      # 產生 Android 原生專案
npx cap add ios          # 產生 iOS 原生專案（需要在 Mac 上執行）
npx cap sync              # 把 web/ 的內容同步進兩個原生專案
```

之後每次改完 `web/index.html`，重新同步再打開對應 IDE 編譯：

```bash
npx cap sync
npx cap open android   # 用 Android Studio 打開，簽名後可產生 .apk / .aab 上架 Google Play
npx cap open ios       # 用 Xcode 打開，需要 Apple Developer 帳號簽名才能上架 App Store
```

**重要提醒**：iOS 上架 App Store 一定要有付費的 Apple Developer 帳號（US$99/年），並在 Xcode 設定簽名憑證與 Provisioning Profile，這一步無法自動化，需要你本人操作一次。

## 放上 GitHub 後自動編譯（GitHub Actions）

`.github/workflows/` 底下已經準備好三個工作流程：

| 檔案 | 作用 | 平台 |
|---|---|---|
| `electron-build.yml` | push 到 main 或打 tag 時，自動編譯 Windows / macOS / Linux 安裝檔並存成 Artifact | 全自動 |
| `android-build.yml` | 自動編譯 Android Debug APK（測試用，未簽名） | 全自動（前提：已在本機執行過 `npx cap add android` 並 commit） |
| `ios-build-check.yml` | 只驗證 iOS 版本能否編譯成功（模擬器、未簽名），確保程式碼沒壞掉 | 需要 `npx cap add ios` 已 commit；正式上架仍需手動簽名 |

編譯完成的檔案可以在 GitHub 的 Actions 頁籤 → 對應的 workflow run → Artifacts 區塊下載。

## 橫向 / 響應式支援

`web/index.html` 已經內建：
- 手機直向時會自動顯示「請將裝置轉為橫向」提示
- 平板／桌面較大螢幕時，UI 面板與搖桿大小會自動調整比例
- 使用 CSS `vw/vh` 相對單位與 `resize` 事件即時重新計算畫布尺寸

## Logo

暫定 Logo 位於 `assets/logo/logo.svg`（向量檔，之後想換設計改這份即可），`assets/logo/icons/` 底下已經預先產生好各平台需要的尺寸，包含 Windows `.ico`。

## 待辦（下一步可以做的事）

- [ ] 幫桌面版 / Android 準備正式的簽名憑證，才能發布到 Microsoft Store / Google Play
- [ ] iOS 上架流程（Apple Developer 帳號、App Store Connect 設定）
- [ ] 正式 Logo 設計（目前是暫定版本）
- [ ] 遊戲內容擴充（詳見遊戲內提示）

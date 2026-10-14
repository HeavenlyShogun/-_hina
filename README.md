# Universe Rhythm Recorder (`_hina`)

這是一個使用 React + Vite 打造的音樂與節奏樂譜播放系統。專案核心著重於將 MIDI、MusicXML 等樂譜轉換為統一的事件資料（Slim JSON），並交由播放控制器處理。系統同時支援 Firebase 雲端曲庫同步、GitHub Pages 自動部署，以及實體硬體控制器的介接規劃。

## 核心架構與資料流

專案自 v1.1 起進行了核心資料模型的收斂與重構：

* **統一事件模型 (Canonical Event Schema)**：樂譜資料全面統一為 `tick`, `durationTicks`, `k`, `v`, `noteName`, `frequency`, `trackId`。
* **播放器重構**：`playbackController` 僅讀取正規化後的 canonical events，不再依賴 `startTick`, `pitch`, `velocity`, `key` 等舊版備用欄位。
* **新 MIDI 匯入**：`midiToSlim.js` 以 `midi-file` 解析原始軌道與事件順序，輸出 Slim V3.2；MusicXML / MXL 也轉成 Slim payload。
* **舊資料相容**：既有 V2/V3 曲譜仍可讀取，並經 `score.js` 正規化為 canonical runtime events。
* **Slim 往返**：`scoreToMidi.js` 以原始 `sourceTrackIndex` 合併軌道，保留同 tick 的 program change / note 順序；不含新 metadata 的舊 Slim 繼續走 legacy 匯出路徑。
* **Slim 軌道契約**：前五欄維持 `[name, channel, instrumentName, programNumber, instrumentFamily]`，後續欄位為 `sourceTrackIndex`、`programChanges`；音符資料保留原始 note-on/off order。
* **播放生命週期**：播放控制器管理自己的 scheduler timer 與 animation frame；音訊引擎負責釋放活動音符。譜面預覽與高頻 playhead 更新分開訂閱。
* **Firebase 安全**：私人曲譜由 Firestore/Storage 擁有者規則保護；大曲譜可保存為 Storage `score.json`。公開摘要複製次數以每位使用者唯一 ledger 限制一次。

## 目錄與工作區結構

除了網頁原始碼（`src/`），專案包含兩個重要的獨立工作區：

### 1. `風物之琴譜/`（樂譜素材工作區）

用於歸檔與整理系統支援的樂譜檔案。

* `縮小版可匯入譜面/slim-json/`：網站可直接讀取的高效壓縮 JSON / Slim JSON。
* `縮小版可匯入譜面/midi/`：轉檔來源 MIDI。需透過轉換區或 `scores:slim:midi` 產出 JSON 後再由系統讀取。
* `待整理/`：尚未符合目前譜面格式，或保留中的原始備份檔案。
* `工具與參考/`：外掛程式、腳本捷徑、參考圖片等非譜面檔案。

### 2. `外接硬體資訊/`（實體演奏控制器工作區）

專案不僅是網頁播放器，也包含硬體介接計畫。此資料夾保存硬體製作、接線圖、韌體與實機測試紀錄。

* 網站有 MIDI 輸入 hook；Hina Lyre 對外硬體輸出整合與實機驗證仍在規劃中。
* 第一代控制器（如 Hina Lyre）的 USB MIDI 介接契約與軟體待辦事項，請見 `外接硬體資訊/硬體計畫資訊.md`。

---

## 本機開發指南

**啟動開發伺服器**

```bash
# 預設啟動 (localhost:5173)
npm run dev

# 允許區網內其他裝置連線同步檢視 (0.0.0.0:5173)
npm run dev:host

```

**開發環境設定備註：**

* 支援 Vite HMR (即時熱更新)，React 程式碼修改後會自動刷新。
* 若在某些磁碟同步或虛擬環境下無法偵測檔案變更，請在 `.env` 中設定 `VITE_USE_POLLING=true`。
* 專案內已處理 SPA 重新整理問題（包含 `index.html` 與 `public/404.html` 重導向機制）。

### 環境變數 (`.env`)

請複製 `.env.example` 建立 `.env` 檔案並填入對應數值：

| 變數名稱 | 說明 |
| --- | --- |
| `VITE_APP_ID` | 應用程式 ID，預設為 `universe-rhythm-recorder` |
| `VITE_FIREBASE_CONFIG` | Firebase 專案設定 (JSON 格式字串) |
| `VITE_INITIAL_AUTH_TOKEN` | 初始驗證 Token (視環境需求設定) |
| `VITE_CUSTOM_DOMAIN` | 自訂網域 (設定後部署時會自動產生 CNAME) |
| `VITE_DEV_HOST` | 開發環境 Host，預設為 `0.0.0.0` |
| `VITE_DEV_PORT` | 開發環境 Port，預設為 `5173` |
| `VITE_HMR_HOST` | 熱更新 Host 指定 |
| `VITE_HMR_CLIENT_PORT` | 熱更新 Client Port 指定 |
| `VITE_USE_POLLING` | 設為 `true` 開啟輪詢偵測檔案變更 (預設 `false`) |

---

## 測試與 CI

```bash
npm run test:unit
npm run build
```

Firebase 規則實測使用 Firestore 與 Storage Emulator，需安裝 Java 21：

```bash
npx firebase emulators:exec --only firestore,storage --project demo-hina-ci "npm run test:rules:emulator"
```

本機若未安裝 Java，仍可執行 `npm run test:unit`；GitHub Actions 會設定 Temurin Java 21，於 push 至 `main`／`master` 或 pull request 時執行單元測試、規則 Emulator 測試及 build。Playwright E2E 測試另行執行：

```bash
npx playwright install chromium
npm run test:e2e
```

專案資料流：`MIDI / MusicXML -> Slim JSON -> Runtime Events -> Tone.js Audio / Sheet UI`。Firebase 長曲譜可分流到 Storage；Hina Lyre 硬體與網站的輸出連接尚未完成實機驗證。

---

## 部署與網域設定

本專案支援 GitHub Pages 與 Firebase Hosting 雙平台部署。GitHub remote 已連線，並透過 `.github/workflows/deploy.yml` 設定推送至 `main` 分支時自動部署。

### 部署指令

```bash
npm run build:pages   # 建置 GitHub Pages 版本 (自動設定 base path 為 /-_hina/)
npm run build:firebase # 建置 Firebase Hosting 版本 (自動設定 base path 為 /)
npm run preview:pages # 本機預覽 GitHub Pages 建置結果

```

*備註：執行 `firebase deploy` 前，`firebase.json` 的 `predeploy` 掛鉤會自動執行 `npm run build:firebase`。*

### 自訂網域與 CI/CD 設定

**1. 設定 GitHub Pages 自訂網域**

1. 在 GitHub Repository 的 `Settings > Pages` 設定 Custom domain。
2. 在 Repository Variables 新增 `VITE_CUSTOM_DOMAIN`。
3. 重新部署後，Vite 建置流程會讀取該變數並自動輸出 `dist/CNAME` 檔案，確保網域設定不會跑版。

**2. 啟用 Firebase 雲端同步 (GitHub Actions)**
若部署版需要正確連線至 Firebase，請在 GitHub Repo Settings 中設定以下 Secrets 與 Variables：

* **Repository Variables**: `VITE_APP_ID`, `VITE_CUSTOM_DOMAIN`
* **Repository Secrets**: `VITE_FIREBASE_CONFIG`, `VITE_INITIAL_AUTH_TOKEN`

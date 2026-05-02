# guilty corn(豐川罪孽玉米企業)

這個專案使用 `Vite + React` 建立，已接上 GitHub 倉庫，並設定成推送到 `main` 後自動部署到 GitHub Pages。

## 已完成項目

- GitHub remote 已連線：`git@github.com:HeavenlyShogun/-_hina.git`
- 本地開發支援即時熱更新：`Vite HMR`
- GitHub Pages 自動部署：`.github/workflows/deploy.yml`
- 自訂網域支援：設定 `VITE_CUSTOM_DOMAIN` 後會自動產生 `CNAME`
- SPA 重新整理修復：`index.html` 與 `public/404.html`
- 專案內含 `風物之琴譜/` 譜面整理資料夾，供匯入譜面與素材歸檔使用

## 本地開發

```bash
npm run dev
```

如果你要在同一個區網內用其他裝置同步檢視，使用：

```bash
npm run dev:host
```

預設開發環境：

- Host：`0.0.0.0`
- Port：`5173`
- React 程式碼修改後即時熱更新
- 若某些磁碟同步或虛擬環境無法偵測檔案變更，可在 `.env` 設定 `VITE_USE_POLLING=true`

## 環境變數

請依照 `.env.example` 建立 `.env`：

```bash
VITE_APP_ID=genshin-lyre-studio
VITE_FIREBASE_CONFIG={"apiKey":"","authDomain":"","projectId":"","storageBucket":"","messagingSenderId":"","appId":""}
VITE_INITIAL_AUTH_TOKEN=
VITE_CUSTOM_DOMAIN=
VITE_DEV_HOST=0.0.0.0
VITE_DEV_PORT=5173
VITE_HMR_HOST=
VITE_HMR_CLIENT_PORT=
VITE_USE_POLLING=false
```

## 部署與網域

GitHub Pages 預設網址：

- `https://heavenlyshogun.github.io/-_hina/`

設定自訂網域：

1. 在 GitHub Repository 的 `Settings > Pages` 設定 custom domain。
2. 在 Repository `Variables` 新增 `VITE_CUSTOM_DOMAIN`。
3. 重新部署後，建置流程會自動輸出 `dist/CNAME`。

如果部署版也要使用 Firebase 雲端同步，請在 GitHub 設定：

- `Variables`：`VITE_APP_ID`、`VITE_CUSTOM_DOMAIN`
- `Secrets`：`VITE_FIREBASE_CONFIG`、`VITE_INITIAL_AUTH_TOKEN`

## 常用指令

```bash
npm run dev
npm run dev:host
npm run build
npm run preview:pages
```

## 譜面資料夾

`風物之琴譜/` 是專案內的譜面素材工作區，目前結構如下：

- `可匯入譜面/`：可直接匯入網站的文字譜，第一行使用 `// [META]` 保存參數
- `待整理/`：尚未符合目前譜面格式或保留中的原始備份
- `工具與參考/`：外掛、捷徑、圖片等非譜面檔案

若要批次整理這個資料夾內的檔案，可執行：

```bash
node scripts/normalize-score-files.mjs
```

## 2026-05-02 Notes

- Canonical event schema is unified as `tick`, `durationTicks`, `k`, `v`, `noteName`, `frequency`, `trackId`.
- `playbackController` now consumes only canonical events and no longer depends on `startTick`, `pitch`, `velocity`, `key`, or other fallback aliases.
- Score text normalization defaults to `numbered-text@1` with `textNotation: "jianpu"` and `ppq: 96`.

# GitHub 與部署記憶

最後更新：2026-06-05

本檔記錄 Git remote、GitHub Pages、Firebase Hosting 與常用部署指令。

## GitHub

- remote name：`origin`
- fetch URL：`git@github.com:HeavenlyShogun/-_hina.git`
- push URL：`git@github.com:HeavenlyShogun/-_hina.git`
- GitHub Pages URL：`https://heavenlyshogun.github.io/-_hina/`

## GitHub Pages

- build 指令：`npm.cmd run build:pages`
- 輸出目錄：`dist-gh`
- base path：`/-_hina/`
- 預覽指令：`npm.cmd run preview:pages`
- 注意：Pages build 不可使用 Firebase Hosting 的 `/` base path。

## Firebase Hosting

- build 指令：`npm.cmd run build:firebase`
- 輸出目錄：`dist-fb`
- base path：`/`
- production deploy：`firebase deploy --only hosting --project guilty-corn`
- staging deploy：`firebase hosting:channel:deploy staging --project guilty-corn --expires 7d`
- 預覽指令：`npm.cmd run preview:firebase`

## 雙部署規則

- Pages 與 Firebase 的 build 產物不可互換，因為 asset URL base path 不同。
- 部署前至少跑一次對應 build；同時改到 routing、public assets、Vite config 時，兩種 build 都要跑。
- `firebase.json` 的 public dir 應指向 `dist-fb`；GitHub Pages 發佈應取 `dist-gh`。
- `.env` / `.env.local` 可供本機使用，但 GitHub Actions 或 Firebase 部署環境需另行配置 secrets/env。

## 常用檢查指令

```powershell
git status --short --branch
npm.cmd run build:firebase
npm.cmd run build:pages
npm.cmd run preview:firebase
npm.cmd run preview:pages
```

## 2026-05-29 驗證結果

- `npm.cmd run build:firebase`：成功產生 `dist-fb`。
- `npm.cmd run build:pages`：成功產生 `dist-gh`。
- 兩者皆有 Vite 警告：`surges-slim.json` 同時被靜態與動態 import。
- 在目前沙盒環境直接跑 build 會出現 `commonjs--resolver spawn EPERM`；需用允許的本機權限重跑，不視為程式碼錯誤。

## 2026-06-03 驗證結果

- 最新音訊引擎修正後，`npm.cmd run build:vite` 已通過。
- `npm.cmd run build:firebase` 與 `npm.cmd run build:pages` 已通過；兩者仍只有既有的空 `firebase-vendor` chunk、`surges-slim.json` 分包與 chunk size 警告。
- `firebase.cmd deploy --only hosting --project guilty-corn` 已成功部署 Firebase Hosting。
- Hosting URL：`https://guilty-corn.web.app`
- PowerShell 內仍建議使用 `npm.cmd`，避免 `npm.ps1` execution policy 問題。
- Firebase Hosting deploy 前仍由 `firebase.json` predeploy 自動重跑 `npm run build:firebase`。

## 2026-06-05 驗證結果

- `npm run build:firebase` 已通過，輸出到 `dist-fb`。
- `npm run build:pages` 已通過，輸出到 `dist-gh`。
- `npm run test:e2e` 已通過 2/2，覆蓋預設 `surges_slim` 載入、播放亮鍵、節奏控制與播放中鎖定樂器切換。
- Firebase preview 可用 `dist-fb` 啟動，首頁 HTML 與核心資源回應 200。
- Firebase preview 的 `/?scoreId=test-share-id` 會回應 SPA HTML，分享連結 routing 可進入 App 初始化流程。
- GitHub Pages preview 可用 repo base path `/-_hina/` 啟動，根路徑 `/` 會導向 `/-_hina/`，首頁 HTML 與核心資源回應 200。
- `surges-slim.json` 預設載入已恢復，不再停在 fallback 空譜面。
- Vite 仍提示主 chunk 超過 500 kB，屬效能警告；目前未改動分包策略。
- 沙盒內執行 Vite build 可能遇到 Windows `commonjs--resolver spawn EPERM`，需用允許子程序的本機權限重跑確認。
- `tone@15.1.22` 必須存在於 `node_modules`，否則 production build 會無法解析 `src/services/audioEngine.js` 的 `tone` import。
- Firestore rules 與 Storage rules 由 `firebase.json` 管理；改公開譜庫或 Storage 指標時，Firebase deploy 需包含 rules。

## 除錯規則

- PowerShell 可能擋 `npm.ps1`，優先使用 `npm.cmd run <script>`。
- Pages 路徑錯誤時先檢查 `vite.config.js` 與 `scripts/build-github-pages.mjs`。
- Firebase 路徑錯誤時先檢查 `scripts/build-firebase-hosting.mjs` 與 `firebase.json`。
- deploy 失敗時先確認 Firebase CLI 登入狀態與目前 project。
